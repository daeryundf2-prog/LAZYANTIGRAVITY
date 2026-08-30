import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	computeLedgerHash,
	getRunDir,
	loadLeasePolicy,
	safeSegment,
} from "./control-plane.js";
import { withLedgerWriteLock } from "./plan-io.js";
import { applyEventToState, readRunEvents, stateFromEventsList } from "./reconstruct.js";
import { stripSensitiveData } from "./sensitive-data-scrubber.js";
import type { EventType, LedgerEvent, RunStateSchema } from "./control-plane-types.js";

// append 핫패스 캐시: 실행별 (원장 파일 크기 → 마지막 이벤트 + 재구성 상태).
// 쓰기 락 안에서만 갱신되고, 사용 전에 파일 크기로 검증한다 — 다른 프로세스가
// 끼어들어 append·rewind·repair로 크기가 바뀌면 캐시는 자동 폐기되고 전체
// 재구성으로 돌아간다(크기만 맞으면 마지막 이벤트와 상태는 불변). 이 캐시가
// append를 O(n) 재구성에서 O(1) 증분으로 바꾼다(ROADMAP 11).
const APPEND_CACHE_LIMIT = 64;
const appendCache = new Map<string, { fileSize: number; lastEvent: LedgerEvent; state: RunStateSchema }>();
const ZERO_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export async function appendRunEvent(
	repoRoot: string,
	runId: string,
	type: EventType,
	data: Omit<LedgerEvent, "timestamp" | "type" | "runId">,
): Promise<LedgerEvent> {
	return withLedgerWriteLock(repoRoot, runId, () => appendRunEventLocked(repoRoot, runId, type, data));
}

async function appendRunEventLocked(
	repoRoot: string,
	runId: string,
	type: EventType,
	data: Omit<LedgerEvent, "timestamp" | "type" | "runId">,
): Promise<LedgerEvent> {
	const runDir = getRunDir(repoRoot, runId);
	if (!existsSync(runDir)) await mkdir(runDir, { recursive: true });
	const eventsFile = join(runDir, "events.jsonl");

	const cacheKey = `${repoRoot}\0${runId}`;
	const cached = appendCache.get(cacheKey);
	let fileStat: { size: number } | null = null;
	try {
		fileStat = statSync(eventsFile);
	} catch {
		fileStat = null; // 원장이 아직 없다 — 콜드 경로
	}
	const cacheHot = cached !== undefined && fileStat !== null && fileStat.size === cached.fileSize;

	let prevHash: string;
	let baseState: RunStateSchema;
	if (cacheHot && cached) {
		prevHash = cached.lastEvent.hash || ZERO_HASH;
		baseState = cached.state;
	} else {
		const existingEvents = await readRunEvents(repoRoot, runId);
		const lastEvent = existingEvents[existingEvents.length - 1];
		prevHash = lastEvent?.hash || ZERO_HASH;
		const policy = await loadLeasePolicy(repoRoot);
		baseState = await stateFromEventsList(existingEvents, policy, repoRoot, runId, new Date());
	}

	const event: LedgerEvent = {
		eventId: randomUUID(),
		timestamp: new Date().toISOString(),
		type,
		runId,
		prevHash,
		...data,
	};
	const cleanEvent = stripSensitiveData(event);
	cleanEvent.hash = computeLedgerHash(cleanEvent);

	await writeFile(eventsFile, `${JSON.stringify(cleanEvent)}\n`, { flag: "a", encoding: "utf8" });
	try {
		const { appendTransactionalEvent } = await import("./control-plane-sqlite.js");
		await appendTransactionalEvent(repoRoot, runId, cleanEvent);
	} catch {}
	const state = await applyEventToState(repoRoot, runId, baseState, cleanEvent);
	await writeFile(join(runDir, "state.json"), JSON.stringify(stripSensitiveData(state), null, 2), "utf8");

	try {
		appendCache.set(cacheKey, { fileSize: statSync(eventsFile).size, lastEvent: cleanEvent, state });
		if (appendCache.size > APPEND_CACHE_LIMIT) {
			const oldest = appendCache.keys().next().value;
			if (oldest !== undefined) appendCache.delete(oldest);
		}
	} catch { /* 캐시 갱신 실패는 다음 append의 콜드 경로로 귀결될 뿐이다 */ }

	if (event.agentId) {
		const agentsDir = join(runDir, "agents");
		if (!existsSync(agentsDir)) await mkdir(agentsDir, { recursive: true });
		// 증분 상태에서 바로 꺼낸다 — 과거에는 getAgentState가 원장 전체를 다시 재구성했다.
		const agentState = state.agents[event.agentId] || null;
		if (agentState) {
			await writeFile(
				join(agentsDir, `${safeSegment(event.agentId)}.json`),
				JSON.stringify(stripSensitiveData(agentState), null, 2),
				"utf8",
			);
		}
	}
	return cleanEvent;
}
