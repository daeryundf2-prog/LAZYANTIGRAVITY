import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { formatContinueResponse, formatStopResponse } from "./output.mjs";

const STATE_FILE = "lazyantigravity-stop-state.json";
const CONTINUABLE_STATUSES = new Set(["active", "paused"]);
const TERMINAL_REASONS = new Set(["max_steps", "max_step", "error", "cancelled"]);

export function runAntigravityStopContinuation(input) {
	const artifact = getSafeArtifact(input.artifactDirectoryPath);
	if (shouldStopBeforeState(input)) return stopAndClear(artifact);

	const sessionKey = `antigravity:${input.conversationId}`;
	const workspaceResult = selectWorkspace(input.workspacePaths, sessionKey);
	if (workspaceResult === null) return stopAndClear(artifact);

	const progress = readProgress(workspaceResult.workspace, workspaceResult.workId, workspaceResult.work, sessionKey);
	if (progress === null || progress.complete) return stopAndClear(artifact);

	const state = readState(artifact);
	if (artifact === null || state === "unsafe") return stop();

	const attempts =
		isStoredState(state, input.conversationId, progress.progressHash) ? state.attempts + 1 : 1;
	if (attempts > 3) return stopAndClear(artifact);

	writeStateAtomically(artifact, {
		conversationId: input.conversationId,
		progressHash: progress.progressHash,
		attempts,
	});
	return { stdout: formatContinueResponse(`lazyantigravity start-work continuation attempt ${attempts}/3`), clearState: false };
}

function shouldStopBeforeState(input) {
	return (
		input.fullyIdle !== true ||
		input.terminationReason !== "model_stop" ||
		typeof input.error === "string" ||
		TERMINAL_REASONS.has(input.terminationReason)
	);
}

function selectWorkspace(workspacePaths, sessionKey) {
	const workspaces = [];
	for (const workspacePath of uniqueCanonicalDirectories(workspacePaths)) {
		const boulder = readBoulder(join(workspacePath, ".omo", "boulder.json"));
		if (boulder === null) continue;
		const work = boulder.works[boulder.activeWorkId];
		if (!workHasSession(work, sessionKey)) return null;
		const duplicate = Object.entries(boulder.works).some(
			([workId, candidate]) => workId !== boulder.activeWorkId && workHasSession(candidate, sessionKey),
		);
		if (duplicate) return null;
		workspaces.push({ workspace: workspacePath, workId: boulder.activeWorkId, work });
	}
	return workspaces.length === 1 ? workspaces[0] : null;
}

function readBoulder(path) {
	if (!isSafeExistingFile(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return null;
		const activeWorkId = parsed.active_work_id;
		const works = parsed.works;
		if (typeof activeWorkId !== "string" || activeWorkId.trim().length === 0 || !isRecord(works)) return null;
		const normalizedWorks = {};
		for (const [workId, value] of Object.entries(works)) {
			const work = parseWork(value);
			if (work !== null) normalizedWorks[workId] = work;
		}
		if (!Object.hasOwn(normalizedWorks, activeWorkId)) return null;
		return { activeWorkId, works: normalizedWorks };
	} catch {
		return null;
	}
}

function parseWork(value) {
	if (!isRecord(value)) return null;
	const activePlan = value.active_plan;
	const status = value.status;
	if (typeof activePlan !== "string" || activePlan.length === 0) return null;
	if (status !== undefined && typeof status !== "string") return null;
	const sessionIds = Array.isArray(value.session_ids)
		? value.session_ids.filter((sessionId) => typeof sessionId === "string")
		: [];
	return { activePlan, status: status ?? "active", sessionIds };
}

function readProgress(workspace, workId, work, sessionKey) {
	if (!CONTINUABLE_STATUSES.has(work.status)) return null;
	const planPath = resolve(workspace, work.activePlan);
	if (!isInside(workspace, planPath) || !isSafeRelativePath(workspace, planPath) || !isSafeExistingFile(planPath)) {
		return null;
	}
	const canonicalPlanPath = realpathSync.native(planPath);
	if (!isInside(workspace, canonicalPlanPath)) return null;
	const relativePlanPath = toForwardSlash(relative(workspace, canonicalPlanPath));
	const checkboxStates = parseTopLevelCheckboxStates(readFileSync(canonicalPlanPath, "utf8"));
	if (checkboxStates.length === 0) return null;
	const complete = checkboxStates.every((checkbox) => checkbox.checked);
	const stable = { work_id: workId, plan: relativePlanPath, status: work.status, session: sessionKey, checkboxStates };
	return { complete, progressHash: sha256(JSON.stringify(stable)) };
}

function parseTopLevelCheckboxStates(markdown) {
	const states = [];
	let counted = false;
	for (const line of markdown.split(/\r?\n/)) {
		if (line.startsWith("## ")) {
			const heading = line.slice(3).trim();
			counted = heading === "TODOs" || heading === "Final Verification Wave";
			continue;
		}
		if (!counted) continue;
		if (line.startsWith("- [ ] ")) states.push({ checked: false, label: line.slice(6) });
		if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) states.push({ checked: true, label: line.slice(6) });
	}
	return states;
}

function getSafeArtifact(artifactDirectoryPath) {
	if (typeof artifactDirectoryPath !== "string" || artifactDirectoryPath.length === 0) return null;
	try {
		const artifact = resolve(artifactDirectoryPath);
		if (!isSafeExistingDirectory(artifact)) return null;
		return realpathSync.native(artifact);
	} catch {
		return null;
	}
}

function readState(artifact) {
	if (artifact === null) return null;
	const path = join(artifact, STATE_FILE);
	if (!existsSync(path)) return null;
	if (!isSafeExistingFile(path)) return "unsafe";
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function writeStateAtomically(artifact, state) {
	const path = join(artifact, STATE_FILE);
	if (!isInside(artifact, path)) throw new Error("state path escaped artifact directory");
	const tempPath = join(artifact, `${STATE_FILE}.tmp-${process.pid}-${randomUUID()}`);
	writeFileSync(tempPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", flag: "wx" });
	renameSync(tempPath, path);
}

function stopAndClear(artifact) {
	if (artifact !== null) {
		const path = join(artifact, STATE_FILE);
		if (existsSync(path) && isSafeExistingFile(path)) rmSync(path, { force: true });
	}
	return stop();
}

function stop() {
	return { stdout: formatStopResponse(), clearState: true };
}

function isStoredState(value, conversationId, progressHash) {
	return (
		isRecord(value) &&
		value.conversationId === conversationId &&
		value.progressHash === progressHash &&
		Number.isSafeInteger(value.attempts) &&
		value.attempts >= 0
	);
}

function uniqueCanonicalDirectories(paths) {
	if (!Array.isArray(paths)) return [];
	const seen = new Set();
	const result = [];
	for (const path of paths) {
		if (typeof path !== "string" || path.length === 0) continue;
		try {
			const resolved = resolve(path);
			if (!isSafeExistingDirectory(resolved)) continue;
			const canonical = realpathSync.native(resolved);
			if (!seen.has(canonical)) {
				seen.add(canonical);
				result.push(canonical);
			}
		} catch {
			continue;
		}
	}
	return result;
}

function isSafeExistingDirectory(path) {
	try {
		const stat = lstatSync(path);
		return stat.isDirectory() && !stat.isSymbolicLink();
	} catch {
		return false;
	}
}

function isSafeExistingFile(path) {
	try {
		const stat = lstatSync(path);
		return stat.isFile() && !stat.isSymbolicLink();
	} catch {
		return false;
	}
}

function isSafeRelativePath(base, target) {
	const rel = relative(base, target);
	if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) return false;
	let current = base;
	for (const part of rel.split(sep)) {
		current = join(current, part);
		const stat = lstatSync(current);
		if (stat.isSymbolicLink()) return false;
	}
	return true;
}

function isInside(base, target) {
	const rel = relative(base, target);
	return rel.length === 0 || (!rel.startsWith("..") && !isAbsolute(rel));
}

function workHasSession(work, sessionKey) {
	return work?.sessionIds.includes(sessionKey) === true;
}

function toForwardSlash(value) {
	return value.split(sep).join("/");
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
