#!/usr/bin/env node
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sharedSkillsRootPath } from "@lazyantigravity/shared-skills";

const componentSkillSources = [
	["comment-checker", "components/comment-checker/skills/comment-checker"],
	["lsp", "components/lsp/skills/lsp"],
	["rules", "components/rules/skills/rules"],
	["ulw-loop", "components/ulw-loop/skills/ulw-loop"],
	["ulw-plan", "components/ultrawork/skills/ulw-plan"],
];

async function pathExists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function copyDir(source, destination) {
	await rm(destination, { recursive: true, force: true });
	await mkdir(dirname(destination), { recursive: true });
	await cp(source, destination, { recursive: true });
}

/**
 * Rebuild aggregate `skills/` from shared-skills + component skill sources.
 * Shared skills are copied first; component skills overwrite the same names.
 */
export async function syncSkills(root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))) {
	const skillsRoot = join(root, "skills");
	await mkdir(skillsRoot, { recursive: true });

	const sharedRoot = sharedSkillsRootPath();
	const sharedEntries = await readdir(sharedRoot, { withFileTypes: true });
	for (const entry of sharedEntries) {
		if (!entry.isDirectory()) continue;
		await copyDir(join(sharedRoot, entry.name), join(skillsRoot, entry.name));
	}

	for (const [skillName, relativeSource] of componentSkillSources) {
		const source = join(root, relativeSource);
		if (!(await pathExists(source))) {
			throw new Error(`Missing component skill source: ${relativeSource}`);
		}
		await copyDir(source, join(skillsRoot, skillName));
	}

	const sharedRefs = join(root, "shared-skills", "references");
	if (await pathExists(sharedRefs)) {
		await copyDir(sharedRefs, join(skillsRoot, "references"));
	}

	console.warn(`[sync-skills] Rebuilt ${skillsRoot}`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}` || process.argv[1]?.endsWith("index.mjs")) {
	// no-op when imported
}
