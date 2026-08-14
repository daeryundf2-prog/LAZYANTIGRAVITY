#!/usr/bin/env node
/**
 * Push aggregate skill edits back to shared-skills / component sources,
 * then rebuild aggregate skills via sync-skills.
 */
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "../src/packages/sync-skills/index.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const componentSkillSources = [
	["comment-checker", "components/comment-checker/skills/comment-checker"],
	["lsp", "components/lsp/skills/lsp"],
	["rules", "components/rules/skills/rules"],
	["ulw-loop", "components/ulw-loop/skills/ulw-loop"],
	["ulw-plan", "components/ultrawork/skills/ulw-plan"],
];

const componentNames = new Set(componentSkillSources.map(([name]) => name));

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

const skillsRoot = join(root, "skills");
const sharedRoot = join(root, "shared-skills", "skills");
const entries = await readdir(skillsRoot, { withFileTypes: true });

for (const entry of entries) {
	if (!entry.isDirectory()) continue;
	if (entry.name === "references") continue;
	const source = join(skillsRoot, entry.name);
	if (componentNames.has(entry.name)) {
		const relative = componentSkillSources.find(([name]) => name === entry.name)?.[1];
		if (!relative) continue;
		await copyDir(source, join(root, relative));
		console.log(`pushed component ${entry.name} -> ${relative}`);
		continue;
	}
	await copyDir(source, join(sharedRoot, entry.name));
	console.log(`pushed shared ${entry.name}`);
}

// Keep aggregate-only helper docs outside named skill folders.
const refs = join(skillsRoot, "references");
if (await pathExists(refs)) {
	await copyDir(refs, join(root, "shared-skills", "references"));
	console.log("pushed shared-skills/references/");
}

await syncSkills(root);
