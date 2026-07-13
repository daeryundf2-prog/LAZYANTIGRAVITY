import assert from "node:assert/strict";
import test from "node:test";

import { exists, readJson } from "./aggregate-plugin-fixture.mjs";

test("[todo6.hooks.official-root] active root publishes only official Antigravity events", async () => {
	const hooks = await readJson("hooks.json");
	assert.deepEqual(Object.keys(hooks), ["lazyantigravity"]);
	assert.deepEqual(Object.keys(hooks.lazyantigravity).sort(), ["PreInvocation", "Stop"]);
	for (const handlers of Object.values(hooks.lazyantigravity)) {
		assert.equal(handlers.length, 1);
		assert.equal(handlers[0].type, "command");
		assert.match(handlers[0].command, /^node \.\/scripts\/antigravity-hook\.mjs (?:PreInvocation|Stop)$/);
		assert.equal(handlers[0].statusMessage, undefined);
	}
});

test("[todo10.hooks.legacy-retired] Codex aggregate hooks and automatic lifecycle surfaces stay absent", async () => {
	assert.equal(await exists("hooks/hooks.json"), false);
	assert.equal(await exists("scripts/auto-update.mjs"), false);
	assert.equal(await exists("scripts/prompt-amplifier.mjs"), false);
	assert.equal(await exists("scripts/hook-runner.mjs"), false);
	const text = JSON.stringify(await readJson("hooks.json"));
	assert.doesNotMatch(text, /PostToolUse|PostCompact|SessionStart|UserPromptSubmit|SubagentStop|statusMessage/);
});
