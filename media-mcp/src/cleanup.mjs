import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { confinePath, getWorkspaceRoot, isInsideRoot, allowedRoots } from "../../workspace-mcp/dist/path-policy.js";

function protection(dir, activeDirs) {
	if (activeDirs.has(dir)) return "active operation";
	if (allowedRoots(true).slice(1).some((root) => isInsideRoot(dir, root) || isInsideRoot(root, dir))) return "allowed evidence root";
	for (const marker of [".pin", ".pinned", ".retain", ".retained", "processing-receipt.json"]) if (existsSync(join(dir, marker))) return "pinned or retained evidence";
	if (existsSync(join(dir, ".active")) && readFileSync(join(dir, ".active"), "utf8") !== "finished") return "active or interrupted operation";
	if (existsSync(join(dir, "status.json"))) {
		try {
			const status = JSON.parse(readFileSync(confinePath(join(dir, "status.json")), "utf8"));
			if (["running", "queued"].includes(status.status)) return "active job";
			if (status.pinned || status.retained || status.processing_receipt) return "retained evidence";
		} catch { return "unreadable job state"; }
	}
	return null;
}

function bytesIn(dir) {
	let bytes = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isSymbolicLink()) throw new Error("Symbolic link requires manual review");
		bytes += entry.isDirectory() ? bytesIn(full) : statSync(confinePath(full)).size;
	}
	return bytes;
}

export function cleanupMedia(args, activeDirs = new Set()) {
	const dryRun = args.dryRun !== false;
	if (!dryRun && args.confirmDelete !== true) return { ok: false, error: "Deletion requires confirmDelete=true after reviewing a dry-run" };
	const mediaDir = confinePath(join(getWorkspaceRoot(), ".lazyantigravity", "media"), { allowMissing: true });
	const keepDays = Number.isFinite(args.keepDays) && args.keepDays > 0 ? args.keepDays : 14;
	const maxMb = Number.isFinite(args.maxMb) && args.maxMb > 0 ? args.maxMb : 500;
	const protectedEntries = [];
	const candidates = [];
	if (existsSync(mediaDir)) for (const entry of readdirSync(mediaDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const dir = confinePath(join(mediaDir, entry.name));
		try {
			const reason = protection(dir, activeDirs);
			if (reason) { protectedEntries.push({ dir: entry.name, reason }); continue; }
			candidates.push({ dir: entry.name, path: dir, bytes: bytesIn(dir), mtime: statSync(dir).mtimeMs });
		} catch (error) { protectedEntries.push({ dir: entry.name, reason: error.message }); }
	}
	candidates.sort((a, b) => a.mtime - b.mtime);
	let remaining = candidates.reduce((sum, entry) => sum + entry.bytes, 0);
	const proposed = [];
	const deleted = [];
	for (const entry of candidates) {
		if (entry.mtime >= Date.now() - keepDays * 86400000 && remaining <= maxMb * 1024 * 1024) continue;
		proposed.push({ dir: entry.dir, bytes: entry.bytes });
		remaining -= entry.bytes;
		if (!dryRun) {
			if (lstatSync(entry.path).isSymbolicLink() || protection(confinePath(entry.path), activeDirs)) continue;
			rmSync(entry.path, { recursive: true, force: false });
			deleted.push({ dir: entry.dir, freedBytes: entry.bytes });
		}
	}
	return { ok: true, dryRun, keepDays, maxMb, proposed, protected: protectedEntries, deleted, totalDeleted: deleted.length, freedBytes: deleted.reduce((sum, entry) => sum + entry.freedBytes, 0), projectedUnprotectedBytes: remaining, limitations: ["Protected evidence is excluded from capacity eviction"] };
}
