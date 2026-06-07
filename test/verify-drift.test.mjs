import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

test("model catalog validation", () => {
	const catalogPath = join(rootDir, "plugins/omo/model-catalog.json");
	assert.ok(existsSync(catalogPath), "model-catalog.json should exist");
	const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

	// Codex properties
	assert.equal(catalog.codex.canAutoRoute, true, "Codex canAutoRoute should be true");

	// Antigravity properties
	assert.equal(catalog.antigravity.canAutoRoute, false, "Antigravity canAutoRoute should be false");
	assert.equal(catalog.antigravity.routingMode, "hint-only", "Antigravity routingMode should be hint-only");

	// Fallback chains reference check
	const availableIds = catalog.antigravity.availableModels.map(m => m.modelId);
	for (const [role, info] of Object.entries(catalog.antigravity.roles)) {
		if (info.fallbackChain) {
			for (const fallbackKey of info.fallbackChain) {
				const isValid = availableIds.includes(fallbackKey) || Object.keys(catalog.antigravity.roles).includes(fallbackKey);
				assert.ok(isValid, `Fallback key ${fallbackKey} for role ${role} must exist in availableModels or roles`);
			}
		}
	}
});

test("alias skill does not contain active prohibited expressions", () => {
	const aliasPath = join(rootDir, "plugins/omo/skill-aliases/ulw/SKILL.md");
	assert.ok(existsSync(aliasPath), "ulw alias SKILL.md should exist");
	const content = readFileSync(aliasPath, "utf8");

	const cleanContent = content.replace(/~~.*?~~/g, "");
	const prohibited = [
		"switching to Opus",
		"verifier will use Gemini",
		"auto model routing enabled on Antigravity",
		"Antigravity will switch models automatically",
		"model auto-routing on Antigravity"
	];

	for (const term of prohibited) {
		assert.ok(!cleanContent.includes(term), `Prohibited active expression found: "${term}"`);
	}
	assert.ok(content.includes("/ulw resume"), "Alias should contain '/ulw resume' guidance");
});

test("checkpoint schema fields in source code", () => {
	const cliCommandsPath = join(rootDir, "plugins/omo/components/ulw-loop/src/cli-commands.ts");
	assert.ok(existsSync(cliCommandsPath), "cli-commands.ts should exist");
	const content = readFileSync(cliCommandsPath, "utf8");

	assert.ok(content.includes("userResumeCommand"), "Source code should support userResumeCommand");
	assert.ok(content.includes("internalResumeCommand"), "Source code should support internalResumeCommand");
	assert.ok(content.includes("resumeCommand"), "Source code should support legacy resumeCommand fallback");
});

test("hooks do not contain LazyCodex branding in statusMessage", () => {
	const hooksPath = join(rootDir, "plugins/omo/hooks/hooks.json");
	assert.ok(existsSync(hooksPath), "hooks.json should exist");
	const content = readFileSync(hooksPath, "utf8");

	assert.ok(!content.includes('"statusMessage": "LazyCodex'), "Hooks should not contain 'LazyCodex' statusMessage prefix");
	assert.ok(content.includes('"statusMessage": "LazyAntigravity'), "Hooks should contain 'LazyAntigravity' statusMessage prefix");
});

test("verify-drift dry-run policy checks", () => {
	const cliPath = join(rootDir, "plugins/omo/components/ulw-loop/dist/cli.js");
	assert.ok(existsSync(cliPath), "cli.js should exist");

	const jsonOutStr = execFileSync("node", [cliPath, "ulw-loop", "dry-run", "--scenario", "quota-opus-exhausted", "--json"], { encoding: "utf8" });
	const jsonOut = JSON.parse(jsonOutStr);
	assert.equal(jsonOut.wouldSwitchModel, false, "wouldSwitchModel must be false in dry-run JSON");
});

test("verify-drift script exits with code 0 on clean workspace", () => {
	try {
		execFileSync("node", [join(rootDir, "scripts/verify-drift.mjs"), "--strict"], { stdio: "pipe" });
	} catch (error) {
		assert.fail(`verify-drift.mjs --strict failed: ${error.message}\nStdout: ${error.stdout?.toString()}\nStderr: ${error.stderr?.toString()}`);
	}
});

