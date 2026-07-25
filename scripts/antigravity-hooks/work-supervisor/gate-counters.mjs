import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { stateDir, appendLedgerEntry } from "./audit-ledger.mjs";

const GATE_STATE_FILE = "gate-counters.json";
const MAX_BLOCKS = 2;

export function readGateCounters(workspaceRoot) {
	const path = join(stateDir(workspaceRoot), GATE_STATE_FILE);
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
	} catch {
		return {};
	}
}

function writeGateCounters(workspaceRoot, state) {
	const dir = stateDir(workspaceRoot);
	const path = join(dir, GATE_STATE_FILE);
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
	renameSync(tmp, path);
}

export function blockOnce(workspaceRoot, agentKey, gateName) {
	const state = readGateCounters(workspaceRoot);
	const key = `${agentKey}:${gateName}`;
	const current = state[key] || 0;
	if (current >= MAX_BLOCKS) {
		appendLedgerEntry(workspaceRoot, {
			type: "gate_fail_open",
			agent_key: agentKey,
			gate: gateName,
			attempts: current,
		});
		return { blocked: false, attempts: current, reason: `${gateName} gate max ${MAX_BLOCKS} blocks reached; fail-open` };
	}
	state[key] = current + 1;
	writeGateCounters(workspaceRoot, state);
	appendLedgerEntry(workspaceRoot, {
		type: "gate_block",
		agent_key: agentKey,
		gate: gateName,
		attempts: current + 1,
	});
	return { blocked: true, attempts: current + 1, reason: "" };
}

export function recoverGate(workspaceRoot, agentKey, gateName) {
	const state = readGateCounters(workspaceRoot);
	const key = `${agentKey}:${gateName}`;
	if (state[key]) {
		delete state[key];
		writeGateCounters(workspaceRoot, state);
		appendLedgerEntry(workspaceRoot, {
			type: "gate_recover",
			agent_key: agentKey,
			gate: gateName,
		});
	}
}
