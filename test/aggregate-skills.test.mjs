import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = JSON.parse(await readFile(join(root, "config", "antigravity-skills.json"), "utf8"));
const activeSkills = catalog.core.map(({ name }) => name);
const experimentalSkills = catalog.experimental.map(({ name }) => name);
const activeSourceFiles = [
	...activeSkills
		.map((name) => name === "frontend-ui-ux" ? "frontend" : name)
		.map((name) => `skill-aliases/${name}/SKILL.md`),
	"components/ulw-loop/skills/ulw-loop/SKILL.md",
];
const prohibitedModelClaims = [
	/\bmodelId\b/i,
	/\b(?:gemini(?:[-\w*]+)?|claude|opus|sonnet)\b[^\n.]{0,80}\b(?:model|route|routing|switch|version|fallback|recommend)/i,
	/\b(?:model|route|routing|switch|version|fallback|recommend)[^\n.]{0,80}\b(?:gemini(?:[-\w*]+)?|claude|opus|sonnet)\b/i,
	/\bmodel\s+recommendation\b/i,
	/\brecommend(?:ed|ation)?\b[^\n.]{0,80}\bmodel\b/i,
	/\bmodel\b[^\n.]{0,80}\brecommend(?:ed|ation)?\b/i,
	/\binherit(?:s|ed|ance)?\b[^\n.]{0,80}\bmodel\b/i,
	/\bmodel\b[^\n.]{0,80}\binherit(?:s|ed|ance)?\b/i,
	/\b(?:model|gemini|claude|version)\b[^\n.]{0,80}\bfallback\b/i,
	/\bfallback\b[^\n.]{0,80}\b(?:model|gemini|claude|version)\b/i,
	/\bswitch(?:ing)?\b[^\n.]{0,80}\bmodel\b/i,
	/\bmodel\b[^\n.]{0,80}\bswitch(?:ing)?\b/i,
	/\bauto(?:matic)?[- ]?(?:model[- ])?routing\b/i,
	/\bper-role\s+model\b/i,
	/\bversion\s+routing\b/i,
];

test("[todo13.aggregate.active-core] #given aggregate skills #when inspected #then discovery exposes exactly the supported 15", async () => {
	const skillNames = (await readdir(join(root, "skills"), { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	assert.deepEqual(skillNames, activeSkills);
	assert.equal(skillNames.length, 15);
});

test("[todo13.aggregate.unsupported-excluded] #given aggregate skills #when inspected #then unsupported entries are repository-only", async () => {
	const archivedNames = (await readdir(join(root, "experimental-skills"), { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	assert.deepEqual(archivedNames, experimentalSkills);
	for (const name of experimentalSkills) {
		await assert.rejects(readFile(join(root, "skills", name, "SKILL.md"), "utf8"));
		await readFile(join(root, "experimental-skills", name, "SKILL.md"), "utf8");
	}
});

test("[todo13.aggregate.native-policy] #given aggregate core skills #when inspected #then unsupported Codex and MCP surfaces are absent", async () => {
	const forbidden = /mcp__|PostToolUse|PostInvocation|UserPromptSubmit|call_omo_agent|spawn_agent|wait_agent|background_output|Codex Harness Tool Compatibility/;
	for (const name of activeSkills) {
		const content = await readFile(join(root, "skills", name, "SKILL.md"), "utf8");
		assert.match(content, /Verified quality-gate policy/);
		assert.match(content, /LSP verification: clean \(<file>\)/);
		assert.match(content, /LSP verification: <N> error\(s\) \(<file>\)/);
		assert.match(content, /LSP verification unavailable: <reason>/);
		assert.doesNotMatch(content, forbidden, name);
	}
});

test("[todo13.aggregate.no-model-routing-claims] #given active source and generated skills #when inspected #then model selection remains user-managed", async () => {
	const skillFiles = [
		...activeSkills.map((name) => `skills/${name}/SKILL.md`),
		...activeSourceFiles,
	];
	for (const relativePath of skillFiles) {
		let content;
		try {
			content = await readFile(join(root, relativePath), "utf8");
		} catch {
			continue;
		}
		for (const prohibited of prohibitedModelClaims) {
			assert.doesNotMatch(content, prohibited, `${relativePath} contains prohibited model-routing claim: ${prohibited}`);
		}
	}
});
