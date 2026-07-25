import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { loadLedger, appendLedgerEntry, stateDir } from "./audit-ledger.mjs";

const TURN_STATE_FILE = "turn-state.json";
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export function registerTurn(workspaceRoot, agentKey) {
	const dir = stateDir(workspaceRoot);
	const path = join(dir, TURN_STATE_FILE);
	const state = readTurnState(workspaceRoot);
	const now = Date.now();
	const existing = state[agentKey];
	if (existing && now - existing.started_at < STALE_THRESHOLD_MS) {
		return { stale: false, turn_id: existing.turn_id };
	}
	const turnId = `turn-${now}-${Math.random().toString(36).slice(2, 8)}`;
	state[agentKey] = { turn_id: turnId, started_at: now, last_activity: now };
	writeTurnState(workspaceRoot, state);
	appendLedgerEntry(workspaceRoot, {
		type: "turn_start",
		agent_key: agentKey,
		turn_id: turnId,
	});
	return { stale: false, turn_id: turnId };
}

export function touchTurn(workspaceRoot, agentKey) {
	const state = readTurnState(workspaceRoot);
	const entry = state[agentKey];
	if (!entry) return registerTurn(workspaceRoot, agentKey);
	entry.last_activity = Date.now();
	writeTurnState(workspaceRoot, state);
	return { stale: false, turn_id: entry.turn_id };
}

export function isStaleTurn(workspaceRoot, agentKey) {
	const state = readTurnState(workspaceRoot);
	const entry = state[agentKey];
	if (!entry) return true;
	const now = Date.now();
	return now - entry.last_activity > STALE_THRESHOLD_MS;
}

export function evaluateStaleMutation(workspaceRoot, agentKey) {
	if (!isStaleTurn(workspaceRoot, agentKey)) {
		return { decision: "allow", reason: "" };
	}
	return {
		decision: "deny",
		reason: `Stale mutation: turn for ${agentKey} is stale (비활성 ${Math.floor(STALE_THRESHOLD_MS / 1000)}초 초과). ` +
			`새 프롬프트를 제출하여 현재 turn을 시작하세요. / Submit a new prompt to start a current turn.`,
	};
}

export function settleTurn(workspaceRoot, agentKey) {
	const state = readTurnState(workspaceRoot);
	if (state[agentKey]) {
		delete state[agentKey];
		writeTurnState(workspaceRoot, state);
		appendLedgerEntry(workspaceRoot, {
			type: "turn_settle",
			agent_key: agentKey,
		});
	}
}

function readTurnState(workspaceRoot) {
	const path = join(stateDir(workspaceRoot), TURN_STATE_FILE);
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
	} catch {
		return {};
	}
}

function writeTurnState(workspaceRoot, state) {
	const dir = stateDir(workspaceRoot);
	const path = join(dir, TURN_STATE_FILE);
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
	renameSync(tmp, path);
}
