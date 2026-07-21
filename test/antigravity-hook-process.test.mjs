import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MAX_HOOK_DIAGNOSTIC_BYTES } from "../scripts/antigravity-hooks/diagnostic.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(root, "test", "fixtures", "antigravity-hooks");
const entrypoint = join(root, "scripts", "antigravity-hook.mjs");
const unrelatedCwd = join(root, "test", "fixtures", "path with spaces", "unrelated cwd");

const validCases = [
	["PreInvocation", "pre-invocation.input.json", "pre-invocation-empty.output.json"],
	["Stop", "stop.input.json", "stop-final.output.json"],
];

for (const [event, inputFixture, outputFixture] of validCases) {
	test(`[todo6.process.${event}] #given official input from unrelated cwd #when the registered command runs #then it emits exactly one official JSON line`, () => {
		mkdirSync(unrelatedCwd, { recursive: true });

		const result = runHook(event, readFixture(inputFixture), unrelatedCwd);

		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.equal(result.stdout, `${JSON.stringify(readJsonFixture(outputFixture))}\n`);
		assert.equal(result.stdout.trimEnd().split(/\r?\n/).length, 1);
	});
}

const invalidCases = [
	["unsupported-event", "UserPromptSubmit", "pre-invocation.input.json"],
	["status-message-field", "PreInvocation", withField(readJsonFixture("pre-invocation.input.json"), "statusMessage", "legacy")],
	["top-level-hooks-field", "PreInvocation", JSON.stringify({ hooks: [] })],
	["malformed-json", "PreInvocation", '{"apiKey":"sk-todo6-secret"'],
	["missing-command-target", undefined, "pre-invocation.input.json"],
];

for (const [name, event, input] of invalidCases) {
	test(`[todo6.process.rejects-${name}] #given malformed or unsupported invocation #when the entrypoint runs #then stdout is empty and stderr is bounded`, () => {
		const payload = input.endsWith?.(".json") ? readFixture(input) : input;
		const result = runHook(event, payload, root);

		assert.notEqual(result.status, 0);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /^ANTIGRAVITY_HOOK_[A-Z_]+: [^\r\n]+\r?\n$/);
		assert.equal(result.stderr.trimEnd().split(/\r?\n/).length, 1);
		assert(Buffer.byteLength(result.stderr, "utf8") <= MAX_HOOK_DIAGNOSTIC_BYTES);
		assert.doesNotMatch(result.stderr, /sk-todo6-secret|statusMessage|hookSpecificOutput|UserPromptSubmit/);
	});
}

test("[todo6.process.no-extra-stdout] #given valid input #when the hook succeeds #then stdout contains only the JSON response", () => {
	const result = runHook("PreInvocation", readFixture("pre-invocation.input.json"), root);

	assert.equal(result.status, 0);
	assert.equal(result.stdout, "{}\n");
	assert.doesNotMatch(result.stdout, /ANTIGRAVITY|statusMessage|hookSpecificOutput/);
});

test("[todo6.process.no-transcript-read] #given the entrypoint source #when inspected #then it does not read transcript paths or emit Codex payloads", () => {
	const source = readFileSync(entrypoint, "utf8");

	assert.doesNotMatch(source, /readFile|createReadStream|transcriptPath|transcript\.jsonl/);
	assert.doesNotMatch(source, /hookSpecificOutput|statusMessage|fallbackPayload/);
});

function runHook(event, input, cwd) {
	const args = event === undefined ? [entrypoint] : [entrypoint, event];
	return spawnSync(process.execPath, args, {
		cwd,
		encoding: "utf8",
		input,
	});
}

function readFixture(filename) {
	return readFileSync(join(fixtureRoot, filename), "utf8");
}

function readJsonFixture(filename) {
	return JSON.parse(readFixture(filename));
}

function withField(payload, field, value) {
	return JSON.stringify({ ...payload, [field]: value });
}
