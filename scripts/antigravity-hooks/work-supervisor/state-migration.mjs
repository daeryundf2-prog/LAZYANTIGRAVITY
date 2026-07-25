import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "./audit-ledger.mjs";

const LEGACY_DIR_NAME = ".fable-lite";
const CANONICAL_DIR_NAME = "work-supervisor";
const MIGRATION_MARKER = ".migrated";
const MIGRATING_MARKER = ".migrating";

export function checkMigration(workspaceRoot) {
	const canonicalDir = join(stateDir(workspaceRoot), "..", CANONICAL_DIR_NAME);
	const legacyDir = join(workspaceRoot, LEGACY_DIR_NAME);
	const canonicalExists = existsSync(canonicalDir);
	const legacyExists = existsSync(legacyDir);

	if (!canonicalExists && !legacyExists) return { layout: "EMPTY", authority: null };
	if (canonicalExists && !legacyExists) return { layout: "NATIVE", authority: canonicalDir };
	if (!canonicalExists && legacyExists) return { layout: "LEGACY", authority: legacyDir };
	if (existsSync(join(canonicalDir, MIGRATION_MARKER))) return { layout: "MIGRATED", authority: canonicalDir };
	if (existsSync(join(canonicalDir, MIGRATING_MARKER))) return { layout: "MIGRATING", authority: legacyDir };
	return { layout: "CONFLICT", authority: null };
}

export function migrateState(workspaceRoot) {
	const status = checkMigration(workspaceRoot);
	if (status.layout === "NATIVE" || status.layout === "MIGRATED") {
		return { migrated: false, reason: "already canonical" };
	}
	if (status.layout !== "LEGACY") {
		return { migrated: false, reason: `cannot migrate from layout: ${status.layout}` };
	}

	const legacyDir = join(workspaceRoot, LEGACY_DIR_NAME);
	const canonicalDir = join(stateDir(workspaceRoot), "..", CANONICAL_DIR_NAME);
	const stagingDir = join(canonicalDir, ".staging");

	try {
		mkdirSync(stagingDir, { recursive: true });
		const files = readdirSync(legacyDir);
		for (const file of files) {
			const src = join(legacyDir, file);
			const dst = join(stagingDir, file);
			const content = readFileSync(src);
			writeFileSync(dst, content);
		}
		writeFileSync(join(canonicalDir, MIGRATING_MARKER), new Date().toISOString(), "utf8");
		for (const file of files) {
			const src = join(stagingDir, file);
			const dst = join(canonicalDir, file);
			renameSync(src, dst);
		}
		writeFileSync(join(canonicalDir, MIGRATION_MARKER), new Date().toISOString(), "utf8");
		rmSync(stagingDir, { recursive: true, force: true });
		rmSync(join(canonicalDir, MIGRATING_MARKER), { force: true });
		return { migrated: true, files_copied: files.length };
	} catch (e) {
		try { rmSync(stagingDir, { recursive: true, force: true }); } catch {}
		return { migrated: false, reason: e.message };
	}
}
