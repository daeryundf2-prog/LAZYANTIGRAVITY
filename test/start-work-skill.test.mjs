import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sharedSkillsRootPath } from "@oh-my-opencode/shared-skills";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const startWorkSkillPaths = [
	join(sharedSkillsRootPath(), "start-work", "SKILL.md"),
];
const stopHookPath = join(
	pluginRoot,
	"components",
	"start-work-continuation",
	"src",
	"codex-hook.ts",
);

test("#given start-work skill without selectable plan #when inspected #then bootstraps ulw-plan before execution", async () => {
	// given / when / then
	for (const skillPath of startWorkSkillPaths) {
		const skill = await readFile(skillPath, "utf8");
		assert.match(
			skill,
			/(?:no|zero)[^.]{0,120}(?:selectable|matching|existing|prometheus)?[^.]{0,120}plans?[^.]{0,160}(?:\$?ulw-plan|ulw-plan skill|spawn_agent\([^)]*ulw-plan)/is,
			`Skill ${skillPath} should reference spawning ulw-plan when no plan is selectable`
		);
		assert.match(
			skill,
			/(?:bootstrap|create|generate|draft)[^.]{0,120}(?:plan|prometheus plan)[^.]{0,120}(?:before|prior to)[^.]{0,80}(?:execution|implementation|boulder)/is,
			`Skill ${skillPath} should reference bootstrapping a plan before execution`
		);
	}
});

test("#given worker done claim #when start-work contract is inspected #then adversarial verification gates fully done", async () => {
	// given / when / then
	for (const skillPath of startWorkSkillPaths) {
		const skill = await readFile(skillPath, "utf8");
		assert.match(skill, /DoneClaim/i);
		assert.match(skill, /worker done claim/i);
		assert.match(skill, /stale_state/);
		assert.match(skill, /misleading_success_output/);
		assert.match(skill, /dirty_worktree/);
		assert.match(skill, /Plan reread/i);
		assert.match(skill, /Manual-QA/i);
		assert.match(skill, /Adversarial QA/i);
		assert.match(skill, /Cleanup/i);
		assert.match(skill, /Only after verification passes/i);
	}
});

test("#given start-work continuation hook #when inspected #then it remains Boulder-only without planning bootstrap logic", async () => {
	// given
	const hook = await readFile(stopHookPath, "utf8");

	// then
	assert.match(hook, /readContinuationState/);
	assert.match(hook, /START_WORK_CONTINUATION_DIRECTIVE/);
	assert.match(hook, /decision:\s*"block"/);
	assert.doesNotMatch(
		hook,
		/\bulw-plan\b|\bspawn_agent\b|\brequest_user_input\b|bootstrap|selectable plan|Phase 1|Create or update Boulder state/i,
	);
});
