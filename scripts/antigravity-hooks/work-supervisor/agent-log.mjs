import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "./audit-ledger.mjs";
import { withOwnerLock } from "./file-lock.mjs";

const AGENTS_DIR = "agents";
const SCHEMA_VERSION = 2;
const MAX_EVENT_BYTES = 65_536;

export function agentLogPath(workspaceRoot, agentName) {
	const safeName = (agentName || "default").replace(/[^A-Za-z0-9_.-]+/g, "-");
	return join(stateDir(workspaceRoot), AGENTS_DIR, `${safeName}.jsonl`);
}

export function appendAgentEvent(workspaceRoot, agentName, event) {
	const dir = join(stateDir(workspaceRoot), AGENTS_DIR);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const record = {
		schema_version: SCHEMA_VERSION,
		ts: new Date().toISOString(),
		...event,
	};

	const line = `${JSON.stringify(record)}\n`;
	if (Buffer.byteLength(line, "utf8") > MAX_EVENT_BYTES) return null;

	const path = agentLogPath(workspaceRoot, agentName);
	try {
		withOwnerLock(workspaceRoot, `agent-log-${agentName}`, () => {
			appendFileSync(path, line, "utf8");
		});
	} catch {
		appendFileSync(path, line, "utf8");
	}
	return record;
}

export function loadAgentEvents(workspaceRoot, agentName) {
	const path = agentLogPath(workspaceRoot, agentName);
	if (!existsSync(path)) return [];
	try {
		const content = readFileSync(path, "utf8").trim();
		if (!content) return [];
		return content.split("\n").filter(Boolean).map((line) => {
			try {
				const parsed = JSON.parse(line);
				return normalizeAgentEvent(parsed);
			} catch {
				return null;
			}
		}).filter(Boolean);
	} catch {
		return [];
	}
}

export function ledgerTransaction(workspaceRoot, fn) {
	return withOwnerLock(workspaceRoot, "ledger-transaction", fn);
}

function normalizeAgentEvent(event) {
	if (!event || typeof event !== "object") return null;
	if (!event.schema_version) {
		return { ...event, schema_version: 1, legacy_event: true };
	}
	return event;
}
