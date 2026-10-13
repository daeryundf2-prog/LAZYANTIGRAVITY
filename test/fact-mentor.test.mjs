import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

test("AGENTS.md specifies fact-mentor Pro-tier adversarial audit subagent (Feature 05)", async () => {
	const agentsMd = await readFile(join(root, "AGENTS.md"), "utf8");
	assert.match(agentsMd, /fact-mentor/);
	assert.match(agentsMd, /Model:\s*"pro"/);
	assert.match(agentsMd, /Adversarial Audit Subagent/i);
	assert.match(agentsMd, /adversarial falsification/i);
});

