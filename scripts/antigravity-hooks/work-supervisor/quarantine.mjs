import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { withOwnerLock } from "./file-lock.mjs";

const QUARANTINE_FILE = "quarantine.json";
const MAX_RECORDS = 64;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_COMMAND_BYTES = 1024 * 1024;

export function quarantinePath(workspaceRoot) {
	const dir = join(workspaceRoot, ".omo", "work-supervisor");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return join(dir, QUARANTINE_FILE);
}

export function addQuarantine(workspaceRoot, entry) {
	return withOwnerLock(workspaceRoot, "quarantine", () => {
		const path = quarantinePath(workspaceRoot);
		const records = loadQuarantine(workspaceRoot);
		const now = Date.now();
		const expired = records.filter((r) => now - r.ts < MAX_AGE_MS);
		const truncatedCmd = entry.command.length > MAX_COMMAND_BYTES
			? entry.command.slice(0, MAX_COMMAND_BYTES)
			: entry.command;
		expired.push({
			...entry,
			command: truncatedCmd,
			originalBytes: Buffer.byteLength(entry.command, "utf8"),
			storedBytes: Buffer.byteLength(truncatedCmd, "utf8"),
			ts: now,
		});
		while (expired.length > MAX_RECORDS) expired.shift();
		let totalBytes = 0;
		const bounded = [];
		for (let i = expired.length - 1; i >= 0; i--) {
			const recBytes = Buffer.byteLength(JSON.stringify(expired[i]), "utf8");
			if (totalBytes + recBytes > MAX_TOTAL_BYTES) break;
			bounded.unshift(expired[i]);
			totalBytes += recBytes;
		}
		const tmpPath = `${path}.tmp-${process.pid}`;
		writeFileSync(tmpPath, JSON.stringify(bounded, null, 2) + "\n", "utf8");
		renameSync(tmpPath, path);
	});
}

export function loadQuarantine(workspaceRoot) {
	const path = quarantinePath(workspaceRoot);
	if (!existsSync(path)) return [];
	try {
		const content = readFileSync(path, "utf8").trim();
		if (!content) return [];
		const parsed = JSON.parse(content);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function clearQuarantine(workspaceRoot) {
	const path = quarantinePath(workspaceRoot);
	if (existsSync(path)) writeFileSync(path, "[]\n", "utf8");
}

export function listQuarantine(workspaceRoot) {
	const now = Date.now();
	return loadQuarantine(workspaceRoot).map((r) => ({
		...r,
		ageMs: now - r.ts,
	}));
}
