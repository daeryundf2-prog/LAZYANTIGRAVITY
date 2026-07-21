#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const explicitFiles = args.filter((arg) => arg.endsWith(".mjs"));
const passThrough = args.filter((arg) => !arg.endsWith(".mjs"));
const testDirectory = join(import.meta.dirname, "..", "test");
const files = explicitFiles.length === 0
	? readdirSync(testDirectory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
		.map((entry) => join(testDirectory, entry.name))
		.sort()
	: explicitFiles;
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files, ...passThrough], {
	stdio: "inherit",
	windowsHide: true,
});
process.exit(result.status ?? 1);
