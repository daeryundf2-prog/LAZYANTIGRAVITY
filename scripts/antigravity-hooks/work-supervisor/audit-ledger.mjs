import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync, renameSync, statSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { realpathSync } from "node:fs";
import { withOwnerLock } from "./file-lock.mjs";

const LEDGER_FILE = "audit-ledger.jsonl";
const MAX_ENTRY_BYTES = 65_536;
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const MAX_LEDGER_ENTRIES = 50_000;

export function stateDir(workspaceRoot) {
	const dir = join(workspaceRoot, ".omo", "work-supervisor");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

export function ledgerPath(workspaceRoot) {
	return join(stateDir(workspaceRoot), LEDGER_FILE);
}

function rotateLedgerIfNeeded(path) {
	let size = 0;
	let entries = 0;
	try {
		size = statSync(path).size;
	} catch {
		return;
	}
	if (size < MAX_LEDGER_BYTES) return;
	try {
		const content = readFileSync(path, "utf8");
		entries = content.split("\n").filter(Boolean).length;
	} catch {
		return;
	}
	if (size < MAX_LEDGER_BYTES && entries < MAX_LEDGER_ENTRIES) return;
	const archive = `${path}.${Date.now()}.archived`;
	try { renameSync(path, archive); } catch {}
}

export function appendLedgerEntry(workspaceRoot, entry) {
	try {
		return withOwnerLock(workspaceRoot, "ledger-append", () => {
			const path = ledgerPath(workspaceRoot);
			rotateLedgerIfNeeded(path);
			const record = { ...entry, ts: Date.now() };
			const prevHash = getPreviousHash(path);
			const seq = getNextSeq(path);
			record.prev_hash = prevHash;
			record.seq = seq;
			record.hash = computeHash(JSON.stringify({ ...record, prev_hash: prevHash, seq }));
			const line = `${JSON.stringify(record)}\n`;
			if (Buffer.byteLength(line, "utf8") > MAX_ENTRY_BYTES) return null;
			appendFileSync(path, line, "utf8");
			return record;
		});
	} catch {
		const path = ledgerPath(workspaceRoot);
		const record = { ...entry, ts: Date.now() };
		const prevHash = getPreviousHash(path);
		const seq = getNextSeq(path);
		record.prev_hash = prevHash;
		record.seq = seq;
		record.hash = computeHash(JSON.stringify({ ...record, prev_hash: prevHash, seq }));
		const line = `${JSON.stringify(record)}\n`;
		if (Buffer.byteLength(line, "utf8") > MAX_ENTRY_BYTES) return null;
		appendFileSync(path, line, "utf8");
		return record;
	}
}

function getPreviousHash(path) {
	if (!existsSync(path)) return "0".repeat(64);
	try {
		const content = readFileSync(path, "utf8").trim();
		if (!content) return "0".repeat(64);
		const lines = content.split("\n");
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const parsed = JSON.parse(lines[i]);
				if (parsed && typeof parsed.hash === "string") return parsed.hash;
			} catch {
				continue;
			}
		}
		return "0".repeat(64);
	} catch {
		return "0".repeat(64);
	}
}

function getNextSeq(path) {
	if (!existsSync(path)) return 1;
	try {
		const content = readFileSync(path, "utf8").trim();
		if (!content) return 1;
		const lines = content.split("\n");
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const parsed = JSON.parse(lines[i]);
				if (parsed && Number.isSafeInteger(parsed.seq)) return parsed.seq + 1;
			} catch {
				continue;
			}
		}
		return 1;
	} catch {
		return 1;
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
	const settlements = new Map();
	for (const entry of entries) {
		if (entry.type === "settle" && entry.agent_key && Array.isArray(entry.paths)) {
			for (const p of entry.paths) {
				settlements.set(`${entry.agent_key}:${p}`, entry.ts || 0);
			}
		}
	}
	const owners = [];
	for (const entry of entries) {
		if ((entry.type === "invocation" || entry.type === "file_write") && Array.isArray(entry.paths)) {
			for (const p of entry.paths) {
				if (p === canonicalPath || p.startsWith(canonicalPath + "/")) {
					const key = `${entry.agent_key}:${p}`;
					const settledTs = settlements.get(key);
					const settled = typeof settledTs === "number" && settledTs >= (entry.ts || 0);
					owners.push({
						agent_key: entry.agent_key || "unknown",
						settled,
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
	});
}

export function settleAgentPaths(workspaceRoot, agentKey, paths) {
	return appendLedgerEntry(workspaceRoot, {
		type: "settle",
		agent_key: agentKey,
		paths: paths || [],
	});
}

export function settleInvocation(workspaceRoot, agentKey) {
	const entries = loadLedger(workspaceRoot);
	const paths = new Set();
	for (const e of entries) {
		if (e.agent_key === agentKey && Array.isArray(e.paths)) {
			for (const p of e.paths) paths.add(p);
		}
	}
	if (paths.size === 0) return null;
	return settleAgentPaths(workspaceRoot, agentKey, [...paths]);
}

function computeHash(data) {
	return createHash("sha256").update(data, "utf8").digest("hex");
}
