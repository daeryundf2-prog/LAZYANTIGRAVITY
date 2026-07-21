import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readme = readFileSync("README.md", "utf8");

test("[todo18.readme.truth] README replaces promotional screenshots with evidence-backed boundaries", () => {
	assert.match(readme, /15 active skills/);
	assert.match(readme, /19 experimental skills are currently unsupported/);
	assert.match(readme, /evidence-backed scorecard/);
	assert.match(readme, /not proven for live installation or production deployment/);
	assert.doesNotMatch(readme, /ULW-Loop: Evidence-Audited Orchestration|assets\/readme\/lazyantigravity-ulw/);
});
