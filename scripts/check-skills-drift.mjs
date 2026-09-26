#!/usr/bin/env node
// Byte-exact drift audit: every file under skills/<name>/ must equal its source
// (shared-skills/skills/<name>, a component skill source, or shared-skills/references).
// SKILL.md-only comparisons miss reference/script drift; this covers the whole tree.
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { componentSkillSources } from "@lazyantigravity/sync-skills";

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function pathExists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function walkFiles(dir, prefix = "") {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(join(dir, entry.name), rel)));
		} else if (entry.isFile()) {
			files.push(rel);
		}
	}
	return files;
}

/**
 * Resolve skill name -> authoritative source directory, mirroring syncSkills():
 * shared-skills/skills first, then component sources overwrite the same names.
 */
export async function resolveSkillSources(root) {
	const sources = new Map();
	const sharedRoot = join(root, "shared-skills", "skills");
	for (const entry of await readdir(sharedRoot, { withFileTypes: true })) {
		if (entry.isDirectory()) sources.set(entry.name, join(sharedRoot, entry.name));
	}
	for (const [skillName, relativeSource] of componentSkillSources) {
		sources.set(skillName, join(root, relativeSource));
	}
	const sharedRefs = join(root, "shared-skills", "references");
	if (await pathExists(sharedRefs)) sources.set("references", sharedRefs);
	return sources;
}

export async function checkSkillsDrift(root = defaultRoot, { sources } = {}) {
	const skillsRoot = join(root, "skills");
	const resolved = sources ?? (await resolveSkillSources(root));
	const result = { missing: [], drifted: [], extra: [], staleDirs: [], checkedFiles: 0 };

	for (const [name, sourceDir] of resolved) {
		const destDir = join(skillsRoot, name);
		const sourceFiles = new Set(await walkFiles(sourceDir));
		const destFiles = (await pathExists(destDir)) ? new Set(await walkFiles(destDir)) : new Set();

		for (const rel of sourceFiles) {
			result.checkedFiles += 1;
			if (!destFiles.has(rel)) {
				result.missing.push(`${name}/${rel}`);
				continue;
			}
			const [sourceBytes, destBytes] = await Promise.all([
				readFile(join(sourceDir, rel)),
				readFile(join(destDir, rel)),
			]);
			if (!sourceBytes.equals(destBytes)) result.drifted.push(`${name}/${rel}`);
		}
		for (const rel of destFiles) {
			if (!sourceFiles.has(rel)) result.extra.push(`${name}/${rel}`);
		}
	}

	for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
		if (entry.isDirectory() && !resolved.has(entry.name)) result.staleDirs.push(entry.name);
	}
	return result;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const report = await checkSkillsDrift(defaultRoot);
	const problems = report.missing.length + report.drifted.length + report.extra.length + report.staleDirs.length;
	for (const [label, items] of [
		["missing", report.missing],
		["drifted", report.drifted],
		["extra", report.extra],
		["stale-dir", report.staleDirs],
	]) {
		for (const item of items) console.error(`${label}: ${item}`);
	}
	if (problems > 0) {
		console.error(`check-skills-drift: ${problems} problem(s) across ${report.checkedFiles} source files — run npm run sync:skills`);
		process.exit(1);
	}
	console.log(`check-skills-drift: ${report.checkedFiles} files byte-identical to their sources`);
}
