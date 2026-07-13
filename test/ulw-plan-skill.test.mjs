import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillPath = join(root, "skills", "ulw-plan", "SKILL.md");

test("[todo13.ulw-plan.native] active planner is bounded, Antigravity-portable, and has no missing reference dependency", async () => {
	const skill = await readFile(skillPath, "utf8");
	assert.match(skill, /^---\r?\nname: ulw-plan\r?\n/m);
	assert.match(skill, /explore first/i);
	assert.match(skill, /worker-ready plan/i);
	assert.match(skill, /server id `lsp`, tool `diagnostics`/);
	assert.doesNotMatch(skill, /references\/full-workflow\.md|call_omo_agent|background_output|team_[a-z_]+|Proceeding to plan generation/);
});
