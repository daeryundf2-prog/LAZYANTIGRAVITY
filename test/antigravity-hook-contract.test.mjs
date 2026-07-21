import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	formatAntigravityHookDiagnostic,
	MAX_HOOK_DIAGNOSTIC_BYTES,
} from "../scripts/antigravity-hooks/diagnostic.mjs";
import {
	parseAntigravityHookInput,
	SUPPORTED_HOOK_EVENTS,
} from "../scripts/antigravity-hooks/input.mjs";
import {
	formatContinueResponse,
	formatEmptyPreInvocationResponse,
	formatEphemeralMessageResponse,
	formatStopResponse,
} from "../scripts/antigravity-hooks/output.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const contractPath = join(root, "contracts", "antigravity", "hooks.md");
const contractMetadataPath = join(root, "contracts", "antigravity", "hooks.contract.json");
const fixtureRoot = join(root, "test", "fixtures", "antigravity-hooks");
const boundaryCli = join(fixtureRoot, "boundary-cli.mjs");
const expectedContractHash = "1d42e45b22596bec959521d698ab220a1bb883986a9998fa27a93c560d75849b";

const preInvocationInput = readJsonFixture("pre-invocation.input.json");
const stopInput = readJsonFixture("stop.input.json");

test("[hook.contract.pinned-hash] #given the vendored hook document #when hashed #then it matches the pinned official bytes", () => {
	// given
	const bytes = readFileSync(contractPath);

	// when
	const actual = createHash("sha256").update(bytes).digest("hex");

	// then
	assert.equal(actual, expectedContractHash);
	assert.equal(bytes.length, 14_581);
});

test("[hook.contract.source-lines] #given line-labelled contract sections #when resolved #then they contain the official field tables", () => {
	// given
	const metadata = readJson(contractMetadataPath);
	const lines = readFileSync(contractPath, "utf8").split("\n");
	const expectations = [
		["handlerConfiguration", ["Hook Handler Configuration", "`command`", "`timeout`"]],
		["commonInput", ["Common Input Fields", "`conversationId`", "`transcriptPath`"]],
		["PreInvocation", ["PreInvocation", "`invocationNum`", "`injectSteps`"]],
		["Stop", ["Stop", "`executionNum`", "`fullyIdle`", "`decision`"]],
	];

	// when / then
	for (const [sectionName, markers] of expectations) {
		const section = sourceRange(lines, metadata.sections[sectionName].sourceLines);
		for (const marker of markers) assert.match(section, new RegExp(escapeRegExp(marker)));
	}
});

test("[hook.contract.official-fixtures] #given source-labelled examples #when extracted #then checked-in fixtures match the official JSON", () => {
	// given
	const metadata = readJson(contractMetadataPath);
	const lines = readFileSync(contractPath, "utf8").split("\n");
	const officialFixtures = [
		"pre-invocation.input.json",
		"pre-invocation-inject.output.json",
		"stop.input.json",
		"stop-continue.output.json",
	];

	// when / then
	for (const filename of officialFixtures) {
		const relativePath = `test/fixtures/antigravity-hooks/${filename}`;
		const extracted = JSON.parse(sourceRange(lines, metadata.fixtures[relativePath]).replace(/^```json\r?\n/, ""));
		assert.deepEqual(readJsonFixture(filename), extracted, relativePath);
	}
});

test("[hook.input.pre-invocation] #given the official PreInvocation fixture #when parsed #then it returns only the approved typed value", () => {
	// given / when
	const parsed = parseAntigravityHookInput("PreInvocation", JSON.stringify(preInvocationInput));

	// then
	assert.deepEqual(parsed, {
		ok: true,
		value: {
			event: "PreInvocation",
			conversationId: preInvocationInput.conversationId,
			workspacePaths: preInvocationInput.workspacePaths,
			artifactDirectoryPath: preInvocationInput.artifactDirectoryPath,
			invocationNum: 3,
			initialNumSteps: 10,
		},
	});
	assert.equal(Object.hasOwn(parsed.value, "transcriptPath"), false);
});

test("[hook.input.stop] #given the official Stop fixture #when parsed #then optional error and documented fields are typed", () => {
	// given / when
	const parsed = parseAntigravityHookInput("Stop", JSON.stringify(stopInput));

	// then
	assert.deepEqual(parsed, {
		ok: true,
		value: {
			event: "Stop",
			conversationId: stopInput.conversationId,
			workspacePaths: stopInput.workspacePaths,
			artifactDirectoryPath: stopInput.artifactDirectoryPath,
			executionNum: 1,
			terminationReason: "model_stop",
			fullyIdle: true,
			error: "",
		},
	});
});

test("[hook.input.stop-optional-error] #given Stop input without error #when parsed #then the optional field remains absent", () => {
	// given
	const payload = { ...stopInput };
	delete payload.error;

	// when
	const parsed = parseAntigravityHookInput("Stop", JSON.stringify(payload));

	// then
	assert.equal(parsed.ok, true);
	assert.equal(Object.hasOwn(parsed.value, "error"), false);
});

const invalidCases = [
	["unsupported-event", "PostToolUse", JSON.stringify(preInvocationInput), "ANTIGRAVITY_HOOK_EVENT_UNSUPPORTED"],
	["post-invocation", "PostInvocation", JSON.stringify(preInvocationInput), "ANTIGRAVITY_HOOK_EVENT_UNSUPPORTED"],
	["empty", "PreInvocation", "  ", "ANTIGRAVITY_HOOK_INPUT_EMPTY"],
	["invalid-json", "PreInvocation", '{"token":"sk-fake-secret"', "ANTIGRAVITY_HOOK_JSON_INVALID"],
	["null-root", "PreInvocation", "null", "ANTIGRAVITY_HOOK_INPUT_ROOT_INVALID"],
	["array-root", "PreInvocation", "[]", "ANTIGRAVITY_HOOK_INPUT_ROOT_INVALID"],
	["scalar-root", "PreInvocation", "17", "ANTIGRAVITY_HOOK_INPUT_ROOT_INVALID"],
	["unknown-field", "PreInvocation", withField(preInvocationInput, "unknown", true), "ANTIGRAVITY_HOOK_INPUT_FIELD_UNSUPPORTED"],
	["snake-case", "PreInvocation", withField(preInvocationInput, "session_id", "codex"), "ANTIGRAVITY_HOOK_INPUT_FIELD_UNSUPPORTED"],
	["missing-field", "PreInvocation", withoutField(preInvocationInput, "conversationId"), "ANTIGRAVITY_HOOK_INPUT_FIELD_MISSING"],
	["wrong-common-type", "PreInvocation", withField(preInvocationInput, "workspacePaths", [1]), "ANTIGRAVITY_HOOK_INPUT_FIELD_TYPE_INVALID"],
	["negative-counter", "PreInvocation", withField(preInvocationInput, "invocationNum", -1), "ANTIGRAVITY_HOOK_INPUT_FIELD_TYPE_INVALID"],
	["fractional-counter", "PreInvocation", withField(preInvocationInput, "initialNumSteps", 1.5), "ANTIGRAVITY_HOOK_INPUT_FIELD_TYPE_INVALID"],
	["missing-fully-idle", "Stop", withoutField(stopInput, "fullyIdle"), "ANTIGRAVITY_HOOK_INPUT_FIELD_MISSING"],
	["wrong-stop-error", "Stop", withField(stopInput, "error", { secret: "fake" }), "ANTIGRAVITY_HOOK_INPUT_FIELD_TYPE_INVALID"],
];

for (const [name, event, input, expectedCode] of invalidCases) {
	test(`[hook.input.${name}] #given invalid input #when parsed #then it returns the expected error union`, () => {
		// given / when
		const parsed = parseAntigravityHookInput(event, input);

		// then
		assert.deepEqual(parsed, { ok: false, error: { code: expectedCode } });
	});
}

test("[hook.output.snapshots] #given all approved response branches #when formatted #then each matches its exact JSON-line snapshot", () => {
	// given / when
	const outputs = [
		[formatEmptyPreInvocationResponse(), "pre-invocation-empty.output.json"],
		[formatEphemeralMessageResponse("Remember to lint"), "pre-invocation-inject.output.json"],
		[formatContinueResponse("Not done yet"), "stop-continue.output.json"],
		[formatStopResponse(), "stop-final.output.json"],
	];

	// then
	for (const [actual, filename] of outputs) {
		assert.equal(actual, `${JSON.stringify(readJsonFixture(filename))}\n`, filename);
		assert.equal(actual.trimEnd().split(/\r?\n/).length, 1);
	}
});

test("[hook.output.invalid-text] #given empty injected text #when formatted #then no unsupported response is constructed", () => {
	// given / when / then
	assert.throws(() => formatEphemeralMessageResponse(""), TypeError);
	assert.throws(() => formatContinueResponse(""), TypeError);
});

const validProcessCases = [
	["PreInvocation", preInvocationInput, "empty", "pre-invocation-empty.output.json"],
	["PreInvocation", preInvocationInput, "inject", "pre-invocation-inject.output.json"],
	["Stop", stopInput, "continue", "stop-continue.output.json"],
	["Stop", stopInput, "stop", "stop-final.output.json"],
];

for (const [event, input, mode, expectedFixture] of validProcessCases) {
	test(`[hook.process.${event}.${mode}] #given official input #when the boundary CLI runs #then it emits one exact JSON line`, () => {
		// given / when
		const result = runBoundary(event, JSON.stringify(input), mode);

		// then
		assert.equal(result.status, 0);
		assert.equal(result.stderr, "");
		assert.equal(result.stdout, `${JSON.stringify(readJsonFixture(expectedFixture))}\n`);
	});
}

const invalidProcessCases = [
	["post-tool-use", "PostToolUse", JSON.stringify(preInvocationInput)],
	["post-invocation", "PostInvocation", JSON.stringify(preInvocationInput)],
	["invalid-json", "PreInvocation", '{"apiKey":"sk-process-secret"'],
	["codex-snake-case", "PreInvocation", JSON.stringify({ session_id: "codex", cwd: root, prompt: "worker" })],
	["secret-field", "PreInvocation", withField(preInvocationInput, "sk-process-secret", true)],
	["missing-stop-field", "Stop", withoutField(stopInput, "fullyIdle")],
];

for (const [name, event, input] of invalidProcessCases) {
	test(`[hook.process.rejects-${name}] #given unsupported or malformed input #when the boundary CLI runs #then stdout is empty and stderr is bounded`, () => {
		// given / when
		const result = runBoundary(event, input);

		// then
		assert.notEqual(result.status, 0);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /^ANTIGRAVITY_HOOK_[A-Z_]+: [^\r\n]+\r?\n$/);
		assert.equal(result.stderr.trimEnd().split(/\r?\n/).length, 1);
		assert(Buffer.byteLength(result.stderr, "utf8") <= MAX_HOOK_DIAGNOSTIC_BYTES);
		assert.doesNotMatch(result.stderr, /sk-process-secret|hookSpecificOutput/);
	});
}

test("[hook.diagnostic.closed-set] #given an unknown diagnostic object #when formatted #then it cannot echo untrusted values", () => {
	// given
	const error = { code: "sk-diagnostic-secret", detail: "Bearer fake-token" };

	// when
	const diagnostic = formatAntigravityHookDiagnostic(error);

	// then
	assert.equal(diagnostic, "ANTIGRAVITY_HOOK_INPUT_INVALID: Hook input is invalid.\n");
	assert(Buffer.byteLength(diagnostic, "utf8") <= MAX_HOOK_DIAGNOSTIC_BYTES);
});

test("[hook.source.no-transcript-read] #given production boundary modules #when inspected #then transcript paths cannot be opened and Codex output is absent", () => {
	// given / when
	const inputSource = readFileSync(join(root, "scripts", "antigravity-hooks", "input.mjs"), "utf8");
	const outputSource = readFileSync(join(root, "scripts", "antigravity-hooks", "output.mjs"), "utf8");

	// then
	assert.doesNotMatch(inputSource, /node:fs|readFile|createReadStream|transcript\.jsonl/);
	assert.doesNotMatch(`${inputSource}\n${outputSource}`, /hookSpecificOutput|PostToolUse|PostInvocation/);
	assert.deepEqual(SUPPORTED_HOOK_EVENTS, ["PreInvocation", "Stop"]);
});

test("[hook.source.loc-limit] #given each production boundary module #when pure LOC is counted #then every module is at most 250 lines", () => {
	// given
	const files = ["diagnostic.mjs", "input.mjs", "output.mjs"];

	// when / then
	for (const filename of files) {
		const source = readFileSync(join(root, "scripts", "antigravity-hooks", filename), "utf8");
		const pureLoc = source.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.trimStart().startsWith("//")).length;
		assert(pureLoc <= 250, `${filename} has ${pureLoc} pure LOC`);
	}
});

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonFixture(filename) {
	return readJson(join(fixtureRoot, filename));
}

function sourceRange(lines, range) {
	const [start, end] = range.split("-").map(Number);
	return lines.slice(start - 1, end).join("\n");
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withField(payload, field, value) {
	return JSON.stringify({ ...payload, [field]: value });
}

function withoutField(payload, field) {
	const copy = { ...payload };
	delete copy[field];
	return JSON.stringify(copy);
}

function runBoundary(event, input, mode = "default") {
	return spawnSync(process.execPath, [boundaryCli, event, mode], {
		cwd: root,
		encoding: "utf8",
		input,
	});
}
