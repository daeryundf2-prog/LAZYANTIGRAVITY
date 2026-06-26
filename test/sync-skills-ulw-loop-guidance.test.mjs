import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("#given synced ulw-loop skill #when worker guidance is inspected #then context-hygiene guidance matches the source", async () => {
	const sourceSkill = await readFile(
		join(root, "components", "ulw-loop", "skills", "ulw-loop", "references", "full-workflow.md"),
		"utf8",
	);
	const syncedSkill = await readFile(join(root, "skills", "ulw-loop", "SKILL.md"), "utf8");
	const syncedWorkflow = await readFile(join(root, "skills", "ulw-loop", "references", "full-workflow.md"), "utf8");
	const legacySubagentToolPattern = new RegExp(["multi", "agent", "v1"].join("_"));
	const requiredPatterns = [
		["invoke_subagent delegation", /invoke_subagent/],
		["send_message follow-up", /send_message/],
		["manage_subagents cleanup", /manage_subagents/],
		["local spawned-name tracking", /Track spawned agent names and conversation IDs locally/],
		["reactive mailbox path", /reactive resume/],
		["progress status contract", /WORKING:/],
		["long-running plan/reviewer background guidance", /Plan and reviewer agents may run for a long time/],
		["polling guard", /Never simulate polling/],
		["git-master checkpointing", /git-master/],
		["touched-path commit-style probe", /touched-path commit history/],
		["verified work-unit commit", /verified work unit/],
		["observed commit style", /commit in the observed style/],
	];

	for (const [label, pattern] of requiredPatterns) {
		assert.match(sourceSkill, pattern, `source skill missing ${label}`);
		assert.match(syncedWorkflow, pattern, `synced workflow missing ${label}`);
	}
	assert.match(syncedSkill, /references\/full-workflow\.md/);
	assert.match(syncedSkill, /invoke_subagent/);
	assert.match(syncedSkill, /send_message/);
	assert.match(syncedSkill, /manage_subagents/);
	assert.doesNotMatch(sourceSkill, legacySubagentToolPattern);
	assert.doesNotMatch(syncedSkill, legacySubagentToolPattern);
	assert.doesNotMatch(syncedWorkflow, legacySubagentToolPattern);
});
