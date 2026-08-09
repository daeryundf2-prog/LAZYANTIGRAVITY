import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const LEGACY_DIR_NAME = ".fable-lite";
const CANONICAL_DIR_NAME = "work-supervisor";
const MIGRATION_MARKER = ".migrated";
const MIGRATING_MARKER = ".migrating";

function canonicalDir(workspaceRoot) {
	return join(workspaceRoot, ".omo", CANONICAL_DIR_NAME);
}

export function checkMigration(workspaceRoot) {
	const canonical = canonicalDir(workspaceRoot);
	const legacyDir = join(workspaceRoot, LEGACY_DIR_NAME);
	const canonicalExists = existsSync(canonical);
	const legacyExists = existsSync(legacyDir);

	if (!canonicalExists && !legacyExists) return { layout: "EMPTY", authority: null };
	if (canonicalExists && !legacyExists) return { layout: "NATIVE", authority: canonical };
	if (!canonicalExists && legacyExists) return { layout: "LEGACY", authority: legacyDir };
	if (existsSync(join(canonical, MIGRATION_MARKER))) return { layout: "MIGRATED", authority: canonical };
	if (existsSync(join(canonical, MIGRATING_MARKER))) return { layout: "MIGRATING", authority: legacyDir };
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
	const canonical = canonicalDir(workspaceRoot);
	const stagingDir = join(canonical, ".staging");

	try {
		mkdirSync(stagingDir, { recursive: true });
		const files = readdirSync(legacyDir);
		const copied = [];
		for (const file of files) {
			const src = join(legacyDir, file);
			if (!statSync(src).isFile()) continue;
			const dst = join(stagingDir, file);
			writeFileSync(dst, readFileSync(src));
			copied.push(file);
		}
		writeFileSync(join(canonical, MIGRATING_MARKER), new Date().toISOString(), "utf8");
		for (const file of copied) {
			renameSync(join(stagingDir, file), join(canonical, file));
		}
		writeFileSync(join(canonical, MIGRATION_MARKER), new Date().toISOString(), "utf8");
		rmSync(stagingDir, { recursive: true, force: true });
		rmSync(join(canonical, MIGRATING_MARKER), { force: true });
		return { migrated: true, files_copied: copied.length };
	} catch (e) {
		try { rmSync(stagingDir, { recursive: true, force: true }); } catch {}
		return { migrated: false, reason: e.message };
	}
}
