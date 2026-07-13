import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const orchestrationSkills = [
	"review-work",
	"start-work",
	"ulw",
	"ulw-loop",
	"ulw-plan",
];

test("[todo13.subagents.native-guidance] #given active orchestration skills #when inspected #then they use Antigravity native collaboration names", async () => {
	for (const skillName of orchestrationSkills) {
		const text = await readFile(join(root, "skills", skillName, "SKILL.md"), "utf8");
		assert.doesNotMatch(text, /spawn_agent|wait_agent|call_omo_agent|background_output|multi_agent_v[0-9]+/);
		assert.doesNotMatch(text, /Codex Harness Tool Compatibility/);
		assert.match(text, /Verified quality-gate policy/);
	}

	const ulw = await readFile(join(root, "skills", "ulw", "SKILL.md"), "utf8");
	assert.match(ulw, /invoke_subagent/);
	assert.match(ulw, /send_message/);
	assert.match(ulw, /manage_subagents/);
});

test("[todo13.subagents.start-work-prefix] #given active start-work skill #when inspected #then continuation state is Antigravity-only", async () => {
	const text = await readFile(join(root, "skills", "start-work", "SKILL.md"), "utf8");
	assert.match(text, /antigravity:<conversationId>/);
	assert.match(text, /Antigravity Stop continuation/);
	assert.doesNotMatch(text, /codex:/i);
});

test("[todo13.subagents.sources-retain-todo8-fixtures] #given publishing workflow sources #when inspected #then LSP fixture contract is present before sync", async () => {
	const workflowFiles = [
		"skill-aliases/ulw/SKILL.md",
		"components/ulw-loop/skills/ulw-loop/SKILL.md",
		"skill-aliases/start-work/SKILL.md",
		"skill-aliases/review-work/SKILL.md",
	];
	for (const workflowFile of workflowFiles) {
		const text = await readFile(join(root, workflowFile), "utf8");
		assert.match(text, /Verified quality-gate policy/);
		assert.match(text, /server id `lsp`, tool `diagnostics`/);
		assert.match(text, /test\/fixtures\/lsp\/clean\.json/);
		assert.match(text, /test\/fixtures\/lsp\/diagnostics\.json/);
		assert.match(text, /test\/fixtures\/lsp\/unavailable\.json/);
	}
});
