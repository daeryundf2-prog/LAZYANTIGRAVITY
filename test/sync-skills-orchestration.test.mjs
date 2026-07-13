import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

for (const skillName of ["review-work", "ulw-loop"]) {
	test(`[todo13.${skillName}.native] active orchestration guidance is bounded and free of foreign harness calls`, async () => {
		const content = await readFile(join(root, "skills", skillName, "SKILL.md"), "utf8");
		assert.match(content, /Antigravity|evidence-backed|verification/i);
		assert.match(content, /unavailable verification as unavailable, never as clean/i);
		assert.doesNotMatch(content, /call_omo_agent|background_output|run_in_background|WORKING:|BLOCKED:|fails or times out/i);
	});
}
