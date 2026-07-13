import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { formatLazyCodexHookStatusMessage, normalizeLazyCodexHookStatusLabel } from "../scripts/hook-status-message.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("legacy status utility remains deterministic for non-active component rebuilds", () => {
	assert.equal(formatLazyCodexHookStatusMessage("0.2.2", "checking OMO comments"), "(OmO) Checking Comments");
	assert.equal(normalizeLazyCodexHookStatusLabel("recommending git bash mcp"), "Recommending Git Bash MCP");
});

test("[todo6.status.retired] official active Antigravity manifest publishes no Codex statusMessage field", async () => {
	const hooks = JSON.parse(await readFile(join(root, "hooks.json"), "utf8"));
	assert.doesNotMatch(JSON.stringify(hooks), /statusMessage|PostToolUse|PostCompact|SessionStart/);
	assert.deepEqual(Object.keys(hooks.lazyantigravity).sort(), ["PreInvocation", "Stop"]);
});
