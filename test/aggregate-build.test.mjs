import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readJson } from "./aggregate-plugin-fixture.mjs";

test("[todo5.build.retired] dependency-free Antigravity root exposes no automatic build lifecycle", async () => {
	const packageJson = await readJson("package.json");
	assert.equal(packageJson.scripts.build, undefined);
	assert.equal(packageJson.scripts.prepack, undefined);
	assert.equal(packageJson.scripts.prepare, undefined);
	assert.equal(packageJson.scripts["rebuild:maintainer"], "node scripts/rebuild-components.mjs");
});

test("[todo17.full-runner.serial] full regression runner fixes process-heavy tests to deterministic serial execution", async () => {
	const source = await readFile(new URL("../scripts/run-tests.mjs", import.meta.url), "utf8");
	assert.match(source, /\["--test",\s*"--test-concurrency=1",\s*\.\.\.files/);
});

test("[todo17.full-runner.paths] full regression runner enumerates sorted concrete test paths", async () => {
	const source = await readFile(new URL("../scripts/run-tests.mjs", import.meta.url), "utf8");
	assert.match(source, /readdirSync\(testDirectory,\s*\{\s*withFileTypes:\s*true\s*\}\)/);
	assert.match(source, /entry\.isFile\(\)\s*&&\s*entry\.name\.endsWith\("\.test\.mjs"\)/);
	assert.match(source, /\.map\(\(entry\)\s*=>\s*join\(testDirectory,\s*entry\.name\)\)/);
	assert.match(source, /\.sort\(\)/);
	assert.doesNotMatch(source, /test\/\*\.test\.mjs/);
});
