import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const stopHookPath = join(
	pluginRoot,
	"components",
	"start-work-continuation",
	"src",
	"codex-hook.ts",
);

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
