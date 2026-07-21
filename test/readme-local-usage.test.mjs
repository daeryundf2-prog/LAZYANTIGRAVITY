import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readme = readFileSync("README.md", "utf8");

test("[todo18.readme.local-verification] README exposes only reproducible local verification commands", () => {
	const commands = [
		"node scripts/validate-root-toolchain.mjs",
		"node scripts/generate-antigravity-docs.mjs --check",
		"node scripts/generate-antigravity-score.mjs --check",
		"node scripts/validate-antigravity-distribution.mjs",
	];

	for (const command of commands) assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.match(readme, /Node\.js >=20\.17/);
	assert.match(readme, /does not establish that Antigravity loaded a live installation/);
	assert.doesNotMatch(readme, /git clone|npx|restart your Antigravity agent session|\$browse/);
});
