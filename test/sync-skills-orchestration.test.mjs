import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function listSkillNames() {
	const skillsRoot = join(root, "skills");
	const entries = await readdir(skillsRoot, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory() && entry.name !== "references")
		.map((entry) => entry.name)
		.sort();
}

async function readSkill(skillName) {
	return readFile(join(root, "skills", skillName, "SKILL.md"), "utf8");
}

function stripForbidMentions(content) {
	return content
		.replaceAll("OpenCode `task(...)` / `call_omo_agent(...)`", "")
		.replaceAll("`task(...)`", "")
		.replaceAll("`call_omo_agent(...)`", "");
}

test("#given Antigravity-default skills #when scanned #then they do not teach OpenCode task/call_omo_agent dispatch", async () => {
	for (const skillName of await listSkillNames()) {
		const content = stripForbidMentions(await readSkill(skillName));
		assert.doesNotMatch(
			content,
			/\b(?:call_omo_agent|task)\s*\(/,
			`${skillName} still contains OpenCode dispatch examples`,
		);
	}
});

test("#given Antigravity-default skills that mention wait_agent #when scanned #then wait_agent is forbidden not taught as the wait loop", async () => {
	for (const skillName of await listSkillNames()) {
		const content = await readSkill(skillName);
		if (!/\bwait_agent\b/.test(content)) continue;
		assert.match(
			content,
			/(?:do \*\*not\*\*|Do \*\*not\*\*|Do not use|\bnever\b)[\s\S]{0,120}`wait_agent`/i,
			`${skillName} mentions wait_agent without forbidding it on Antigravity`,
		);
		assert.doesNotMatch(
			content,
			/collect via the Codex mapping above \(`wait_agent`/,
			`${skillName} still teaches Codex wait_agent collection as the default path`,
		);
	}
});

test("#given core orchestration skills #when inspected #then invoke_subagent is the Antigravity dispatch verb", async () => {
	for (const skillName of ["ulw", "ulw-loop", "ulw-plan", "start-work", "review-work"]) {
		const content = await readSkill(skillName);
		assert.match(content, /invoke_subagent/, `${skillName} missing invoke_subagent`);
	}
});
