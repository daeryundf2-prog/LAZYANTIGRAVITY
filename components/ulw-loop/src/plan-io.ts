import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { aggregateCodexObjectiveForScope } from "./goal-status.js";
import {
	repoRelative,
	type UlwLoopScope,
	ulwLoopDir,
	ulwLoopGoalsPath,
	ulwLoopLedgerPath,
	ulwLoopRelativeDir,
} from "./paths.js";
import type { UlwLoopLedgerEntry, UlwLoopPlan } from "./types.js";
import { iso, ULW_LOOP_DIR, ULW_LOOP_GOALS, ULW_LOOP_LEDGER, UlwLoopError } from "./types.js";

const LEGACY_OBJECTIVE_PREFIX = `Complete all ulw-loop stories in ${ULW_LOOP_DIR}/${ULW_LOOP_GOALS}: `;
const LEGACY_OBJECTIVE = `Complete all ulw-loop stories listed in ${ULW_LOOP_DIR}/${ULW_LOOP_GOALS}. Use ${ULW_LOOP_DIR}/${ULW_LOOP_LEDGER} as the durable audit trail.`;
const locks = new Map<string, Promise<unknown>>();

const RETRY_DELAY_MS = 25;
const LOCK_TIMEOUT_MS = 10_000;
// 경합 중 재시도해야 하는 open 오류. EEXIST는 이미 락이 있다는 뜻이고,
// EPERM/EACCES는 Windows의 삭제-대기 전이(다른 프로세스가 방금 rm한 파일에
// CREATE_NEW로 진입)나 백신 실시간 스캔이 만드는 일시적 실패다 — 이걸 재시도
// 하지 않으면 부하가 높은 환경에서 락 획득이 확률적으로 죽는다.
const RETRYABLE_LOCK_CODES = new Set(["EEXIST", "EPERM", "EACCES"]);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cross-process file lock for a ulw-loop run ledger. Uses an atomic `open(path, "wx")`
 * lock file so concurrent processes (hook + CLI + heartbeat) cannot read-modify-write
 * the same hash chain with a shared prevHash. Releases the lock on completion or error.
 */
export async function withLedgerWriteLock<T>(repoRoot: string, runId: string, fn: () => Promise<T>): Promise<T> {
	const lockDir = getRunDir(repoRoot, runId);
	await mkdir(lockDir, { recursive: true });
	const lockPath = join(lockDir, ".write.lock");
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	let lastCode = "EEXIST";
	while (true) {
		try {
			handle = await open(lockPath, "wx");
			break;
		} catch (error) {
			const code = errorCode(error);
			if (code === undefined || !RETRYABLE_LOCK_CODES.has(code)) throw error;
			lastCode = code;
			if (Date.now() > deadline) {
				throw new UlwLoopError(
					`Could not acquire ledger write lock ${lockPath} within ${LOCK_TIMEOUT_MS}ms (last error: ${lastCode}).`,
					"ULW_LOOP_LEDGER_LOCK_TIMEOUT",
				);
			}
			await sleep(RETRY_DELAY_MS);
		}
	}
	try {
		return await fn();
	} finally {
		// 락 파일 제거와 fd 닫기의 순서는 플랫폼별로 다르다. 유닉스는 열린
		// fd를 unlink할 수 있으므로 rm을 먼저 한다(크래시로 close가 생략돼도
		// 락이 남지 않는다). Windows는 열린 파일을 unlink할 수 없으므로 close가
		// 반드시 먼저여야 한다.
		if (process.platform === "win32") {
			await handle.close();
			await rm(lockPath, { force: true });
		} else {
			await rm(lockPath, { force: true });
			await handle.close();
		}
	}
}

function getRunDir(repoRoot: string, runId: string): string {
	const safe = runId.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^(\.\.(\/|\\|$))+/, "") || "default";
	return join(repoRoot, ".lazycodex", "runs", safe);
}

function hasCode(error: unknown, code: string): boolean {
	return errorCode(error) === code;
}

function errorCode(error: unknown): string | undefined {
	return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function isLegacyEnumeratedAggregateObjective(objective: string | undefined): objective is string {
	return objective === LEGACY_OBJECTIVE || Boolean(objective?.startsWith(LEGACY_OBJECTIVE_PREFIX));
}

function isSteeringKind(value: unknown): value is UlwLoopLedgerEntry["kind"] {
	return value === "steering_accepted" || value === "steering_rejected" || value === "criteria_revised";
}

export async function withUlwLoopMutationLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T>;
export async function withUlwLoopMutationLock<T>(
	repoRoot: string,
	scope: UlwLoopScope | undefined,
	fn: () => Promise<T>,
): Promise<T>;
export async function withUlwLoopMutationLock<T>(
	repoRoot: string,
	scopeOrFn: UlwLoopScope | (() => Promise<T>) | undefined,
	maybeFn?: () => Promise<T>,
): Promise<T> {
	const scope = typeof scopeOrFn === "function" ? undefined : scopeOrFn;
	const fn = typeof scopeOrFn === "function" ? scopeOrFn : maybeFn;
	if (fn === undefined) throw new UlwLoopError("Missing ulw-loop mutation body.", "ULW_LOOP_LOCK_BODY_MISSING");
	const lockKey = `${repoRoot}\0${ulwLoopRelativeDir(scope)}`;
	const prior = locks.get(lockKey) ?? Promise.resolve();
	const run = prior.then(fn, fn);
	locks.set(
		lockKey,
		run.catch(() => undefined),
	);
	return run;
}

export async function readUlwLoopPlan(repoRoot: string, scope?: UlwLoopScope): Promise<UlwLoopPlan> {
	const path = ulwLoopGoalsPath(repoRoot, scope);
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		if (!hasCode(error, "ENOENT")) throw error;
		throw new UlwLoopError(
			`No ulw-loop plan found at ${repoRelative(path, repoRoot)}. Run \`lazyantigravity ulw-loop create-goals ...\` first.`,
			"ULW_LOOP_PLAN_MISSING",
			{ cause: error },
		);
	}
	const parsed: UlwLoopPlan = JSON.parse(raw);
	if (parsed.version !== 1 || !Array.isArray(parsed.goals)) {
		throw new UlwLoopError(`Invalid ulw-loop plan at ${repoRelative(path, repoRoot)}.`, "ULW_LOOP_PLAN_INVALID");
	}
	const previousObjective = parsed.codexObjective;
	if (
		(parsed.codexGoalMode ?? "per_story") === "aggregate" &&
		isLegacyEnumeratedAggregateObjective(previousObjective)
	) {
		const now = iso();
		parsed.codexObjective = aggregateCodexObjectiveForScope(scope);
		parsed.codexObjectiveAliases = [...new Set([...(parsed.codexObjectiveAliases ?? []), previousObjective])];
		parsed.updatedAt = now;
		await writePlan(repoRoot, parsed, scope);
		await appendLedger(
			repoRoot,
			{
				at: now,
				kind: "aggregate_objective_migrated",
				message: "Migrated legacy enumerated aggregate Codex objective to the stable pointer objective.",
				before: { codexObjective: previousObjective },
				after: { codexObjective: parsed.codexObjective },
			},
			scope,
		);
	}
	return parsed;
}

let writePlanLock = Promise.resolve();

export async function writePlan(repoRoot: string, plan: UlwLoopPlan, scope?: UlwLoopScope): Promise<void> {
	const currentOperation = writePlanLock.then(async () => {
		await mkdir(ulwLoopDir(repoRoot, scope), { recursive: true });
		const path = ulwLoopGoalsPath(repoRoot, scope);
		const tmpPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
		await writeFile(tmpPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
		await rename(tmpPath, path);
	});
	writePlanLock = currentOperation.catch(() => {});
	return currentOperation;
}

export async function appendLedger(repoRoot: string, entry: UlwLoopLedgerEntry, scope?: UlwLoopScope): Promise<void> {
	await mkdir(ulwLoopDir(repoRoot, scope), { recursive: true });
	await appendFile(ulwLoopLedgerPath(repoRoot, scope), `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readSteeringLedgerEntries(repoRoot: string, scope?: UlwLoopScope): Promise<UlwLoopLedgerEntry[]> {
	let raw: string;
	try {
		raw = await readFile(ulwLoopLedgerPath(repoRoot, scope), "utf8");
	} catch (error) {
		if (hasCode(error, "ENOENT")) return [];
		throw error;
	}
	const entries: UlwLoopLedgerEntry[] = [];
	for (const line of raw.split(/\r?\n/).filter(Boolean)) {
		const entry: UlwLoopLedgerEntry = JSON.parse(line);
		if (isSteeringKind(entry.kind)) entries.push(entry);
	}
	return entries;
}
