import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(root, "hooks.json");
const alternateManifestPath = join(root, "hooks", "hooks.json");

const expectedManifest = {
	lazyantigravity: {
		PreInvocation: [
			{
				type: "command",
				command: "node ./scripts/antigravity-hook.mjs PreInvocation",
				timeout: 10,
			},
		],
		Stop: [
			{
				type: "command",
				command: "node ./scripts/antigravity-hook.mjs Stop",
				timeout: 10,
			},
		],
	},
};

test("[todo6.manifest.exact-official-shape] #given the active root manifest #when parsed #then only official Antigravity command hooks are registered", () => {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

	assert.deepEqual(manifest, expectedManifest);
});

test("[todo6.manifest.no-legacy-codex-fields] #given the active root manifest #when scanned #then unsupported Codex hook keys and output payloads are absent", () => {
	const manifestSource = readFileSync(manifestPath, "utf8");
	const bannedTokens = [
		'"hooks"',
		"SessionStart",
		"UserPromptSubmit",
		"PreToolUse",
		"PostToolUse",
		"PostCompact",
		"SubagentStop",
		"statusMessage",
		"failurePolicy",
		"fallbackPayload",
		"hookSpecificOutput",
		"${PLUGIN_ROOT}",
		"transcript.jsonl",
	];

	for (const token of bannedTokens) {
		assert.doesNotMatch(manifestSource, new RegExp(escapeRegExp(token)), token);
	}
});

test("[todo6.manifest.no-alternate-active-manifest] #given hooks/hooks.json #when checked #then no alternate active manifest remains", () => {
	assert.equal(existsSync(alternateManifestPath), false);
});

test("[todo6.manifest.commands-resolve-from-staged-root] #given registered commands #when resolved from the plugin root #then every target exists and uses the pinned relative path", () => {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const commands = Object.values(manifest.lazyantigravity).flat().map((hook) => hook.command);

	assert.deepEqual(commands, [
		"node ./scripts/antigravity-hook.mjs PreInvocation",
		"node ./scripts/antigravity-hook.mjs Stop",
	]);
	for (const command of commands) {
		const [, scriptPath] = command.split(" ");
		assert.equal(existsSync(join(root, scriptPath)), true, command);
	}
});

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
