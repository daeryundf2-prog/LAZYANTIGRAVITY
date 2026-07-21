import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function readText(relativePath) {
	return readFile(join(root, relativePath), "utf8");
}

async function listFiles(relativeDir) {
	const absoluteDir = join(root, relativeDir);
	const entries = await readdir(absoluteDir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const relativePath = join(relativeDir, entry.name).replaceAll("\\", "/");
		if (entry.isDirectory()) {
			files.push(...await listFiles(relativePath));
			continue;
		}
		files.push(relativePath);
	}
	return files.sort();
}

test("[todo10.runtime-retirement] retired prompt/network lifecycle files are absent", async () => {
	const retiredPaths = [
		"scripts/prompt-amplifier.mjs",
		"scripts/check-prompt-density.mjs",
		"scripts/hook-runner.mjs",
		"scripts/auto-update.mjs",
		"components/telemetry",
	];

	assert.deepEqual(retiredPaths.filter((relativePath) => existsSync(join(root, relativePath))), []);
});

test("[todo10.runtime-retirement] active manifests do not reference retired lifecycle surfaces", async () => {
	const activeFiles = [
		"hooks.json",
		"package.json",
		"plugin.json",
		"config/component-sources.json",
		"config/distribution-files.json",
		"config/test-files.json",
	];
	const retiredPattern = /prompt-amplifier|check-prompt-density|hook-runner|auto-update|components\/telemetry|SessionStart|UserPromptSubmit|PostToolUse|PostCompact/i;

	for (const relativePath of activeFiles) {
		const text = await readText(relativePath);
		assert.doesNotMatch(text, retiredPattern, relativePath);
	}
});

test("[todo10.runtime-retirement] tests no longer import retired network lifecycle modules", async () => {
	const testFiles = await listFiles("test");
	const retiredImportPattern = /from\s+["'][^"']*(?:auto-update|prompt-amplifier|check-prompt-density|hook-runner)[^"']*["']/;
	const offenders = [];

	for (const relativePath of testFiles) {
		const text = await readText(relativePath);
		if (retiredImportPattern.test(text)) offenders.push(relativePath);
	}

	assert.deepEqual(offenders, []);
});
