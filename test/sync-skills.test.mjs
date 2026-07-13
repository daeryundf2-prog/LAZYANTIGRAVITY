import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = JSON.parse(await readFile(join(root, "config", "antigravity-skills.json"), "utf8"));

const activeSkills = catalog.core.map(({ name }) => name);
const experimentalSkills = catalog.experimental.map(({ name }) => name);
const forbiddenTerms = [
	"mcp__",
	"PostToolUse",
	"PostInvocation",
	"UserPromptSubmit",
	"spawn_agent",
	"wait_agent",
	"call_omo_agent",
	"background_output",
	"Codex Harness Tool Compatibility",
];

async function listDirectories(path) {
	return (await readdir(path, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

test("[todo13.sync.active-only] #given synced skills #when discovery root is listed #then only the approved core is active", async () => {
	assert.deepEqual(await listDirectories(join(root, "skills")), activeSkills);
});

test("[todo13.sync.experimental-archive] #given synced skills #when repository-only archive is listed #then all unsupported skills are excluded from discovery", async () => {
	assert.deepEqual(await listDirectories(join(root, "experimental-skills")), experimentalSkills);
	for (const name of experimentalSkills) {
		await assert.rejects(readFile(join(root, "skills", name, "SKILL.md"), "utf8"));
		await readFile(join(root, "experimental-skills", name, "SKILL.md"), "utf8");
	}
});

test("[todo13.sync.native-core] #given active core skills #when inspected #then native Antigravity policy replaces compatibility shims", async () => {
	for (const name of activeSkills) {
		const content = await readFile(join(root, "skills", name, "SKILL.md"), "utf8");
		assert.match(content, new RegExp(`^---\\r?\\nname: ${name}\\r?\\n`, "m"));
		assert.match(content, /Verified quality-gate policy/);
		assert.match(content, /server id `lsp`, tool `diagnostics`/);
		assert.match(content, /\{filePath:"<absolute changed file>",severity:"error"\}/);
		for (const forbidden of forbiddenTerms) {
			assert.doesNotMatch(content, new RegExp(forbidden), `${name} contains ${forbidden}`);
		}
	}
});

test("[todo13.sync.start-work-prefix] #given active start-work skill #when inspected #then Antigravity Stop session prefix is exact", async () => {
	const content = await readFile(join(root, "skills", "start-work", "SKILL.md"), "utf8");
	assert.match(content, /antigravity:<conversationId>/);
	assert.doesNotMatch(content, /codex:/i);
});
