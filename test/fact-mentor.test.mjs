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

test("skills/review-work and skills/boost integrate fact-mentor oracle gate", async () => {
	const reviewWork = await readFile(join(root, "shared-skills", "skills", "review-work", "SKILL.md"), "utf8");
	assert.match(reviewWork, /fact-mentor/);
	assert.match(reviewWork, /FACT-MENTOR ADVERSARIAL AUDIT/);
	assert.match(reviewWork, /Adversarial Falsification Oracle \(Pro\)/);
	assert.match(reviewWork, /Fact Falsification \(`fact-mentor`\)/);
	assert.match(reviewWork, /Fact Falsification Oracle \(`fact-mentor`, Pro\)/);

	const boost = await readFile(join(root, "shared-skills", "skills", "boost", "SKILL.md"), "utf8");
	assert.match(boost, /fact-mentor Adversarial Oracle \(Pro, Blocking\)/);
});

