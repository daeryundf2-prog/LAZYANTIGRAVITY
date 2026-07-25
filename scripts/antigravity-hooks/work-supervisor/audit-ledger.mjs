import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";
import { realpathSync } from "node:fs";

const LEDGER_FILE = "audit-ledger.jsonl";
const MAX_ENTRY_BYTES = 65_536;
const MAX_ENTRIES = 10_000;

export function stateDir(workspaceRoot) {
	const dir = join(workspaceRoot, ".omo", "work-supervisor");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

export function ledgerPath(workspaceRoot) {
	return join(stateDir(workspaceRoot), LEDGER_FILE);
}

export function appendLedgerEntry(workspaceRoot, entry) {
	const path = ledgerPath(workspaceRoot);
	const record = {
		...entry,
		ts: Date.now(),
	};
	const prevHash = getPreviousHash(path);
	record.prev_hash = prevHash;
	record.hash = computeHash(JSON.stringify({ ...record, prev_hash: prevHash }));
	const line = `${JSON.stringify(record)}\n`;
	if (Buffer.byteLength(line, "utf8") > MAX_ENTRY_BYTES) return null;
	appendFileSync(path, line, "utf8");
	return record;
}

function getPreviousHash(path) {
	if (!existsSync(path)) return "0".repeat(64);
	try {
		const content = readFileSync(path, "utf8").trim();
		if (!content) return "0".repeat(64);
		const lines = content.split("\n");
		const lastLine = lines[lines.length - 1];
		if (!lastLine) return "0".repeat(64);
		const parsed = JSON.parse(lastLine);
		return typeof parsed.hash === "string" ? parsed.hash : "0".repeat(64);
	} catch {
		return "0".repeat(64);
	}
}

export function loadLedger(workspaceRoot) {
	const path = ledgerPath(workspaceRoot);
	if (!existsSync(path)) return [];
	try {
		const content = readFileSync(path, "utf8").trim();
		if (!content) return [];
		return content.split("\n").filter(Boolean).map((line) => {
			try { return JSON.parse(line); } catch { return null; }
		}).filter(Boolean);
	} catch {
		return [];
	}
}

export function verifyLedgerIntegrity(workspaceRoot) {
	const entries = loadLedger(workspaceRoot);
	let prevHash = "0".repeat(64);
	for (const entry of entries) {
		if (entry.prev_hash !== prevHash) return false;
		const { hash, ...rest } = entry;
		const expected = computeHash(JSON.stringify({ ...rest, prev_hash: entry.prev_hash }));
		if (entry.hash !== expected) return false;
		prevHash = entry.hash;
	}
	return true;
}

export function canonicalizePath(root, target) {
	const normalized = target.trim().replace(/\\/g, "/");
	if (!normalized) return null;
	const base = realpathSync.native(root);
	const absolute = isAbsolute(normalized) ? normalized : join(base, normalized);
	let rel;
	try {
		rel = relative(base, absolute);
	} catch {
		return null;
	}
	if (rel === "." || rel === "" || rel.startsWith("..")) return null;
	return rel.replace(/\\/g, "/");
}

export function lookupPathAttribution(workspaceRoot, canonicalPath) {
	const entries = loadLedger(workspaceRoot);
	const owners = [];
	for (const entry of entries) {
		if (entry.paths && Array.isArray(entry.paths)) {
			for (const p of entry.paths) {
				if (p === canonicalPath || p.startsWith(canonicalPath + "/")) {
					owners.push({
						agent_key: entry.agent_key || "unknown",
						settled: entry.settled === true,
						ts: entry.ts,
					});
				}
			}
		}
	}
	return owners;
}

export function hasUnsettledPeer(workspaceRoot, canonicalPath, callerAgentKey) {
	const owners = lookupPathAttribution(workspaceRoot, canonicalPath);
	return owners.some((o) => o.agent_key !== callerAgentKey && !o.settled);
}

export function recordInvocation(workspaceRoot, params) {
	return appendLedgerEntry(workspaceRoot, {
		type: "invocation",
		agent_key: params.agentKey,
		host: params.host,
		session_id: params.sessionId,
		agent: params.agent,
		paths: params.paths || [],
		command: params.command || "",
		settled: false,
	});
}

export function settleInvocation(workspaceRoot, agentKey) {
	const entries = loadLedger(workspaceRoot);
	const dir = stateDir(workspaceRoot);
	const tmpPath = join(dir, `${LEDGER_FILE}.tmp-${process.pid}`);
	const lines = entries.map((e) => {
		if (e.agent_key === agentKey && e.type === "invocation") {
			e.settled = true;
		}
		return JSON.stringify(e);
	}).join("\n") + "\n";
	writeFileSync(tmpPath, lines, "utf8");
	renameSync(tmpPath, ledgerPath(workspaceRoot));
}

function computeHash(data) {
	return createHash("sha256").update(data, "utf8").digest("hex");
}
