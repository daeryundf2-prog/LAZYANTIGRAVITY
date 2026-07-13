import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const policy = readJson("config/verified-gates.json");
const unsupportedPostToolEvent = ["Post", "Tool", "Use"].join("");
const unsupportedPostInvokeEvent = ["Post", "Invocation"].join("");
const unsupportedMcpPrefix = ["mcp", "__"].join("");
const forbiddenSourceTerms = [
	unsupportedPostToolEvent,
	unsupportedPostInvokeEvent,
	["fake", "Codex", "payload"].join(" "),
];
const workflowFiles = [
	"skill-aliases/ulw/SKILL.md",
	"components/ulw-loop/skills/ulw-loop/SKILL.md",
	"skill-aliases/start-work/SKILL.md",
	"skill-aliases/review-work/SKILL.md",
];

test("[todo8.gates.policy] #given verified gate policy #when inspected #then automatic diagnostics stay bounded and unsupported payloads are rejected", () => {
	assert.equal(policy.policyId, "lazyantigravity.todo8.verified-quality-gates");
	assert.deepEqual(policy.automaticGates.map((gate) => gate.kind).sort(), ["bounded_context", "bounded_continuation"].sort());
	assert.deepEqual(policy.experimentalGates.map((gate) => gate.kind).sort(), ["comment_checker", "file_targeted_diagnostics"].sort());
	assert.deepEqual(policy.unsupportedAutomaticDiagnostics.eventPayloadKinds, [
		"post-tool hook payload",
		"post-invocation hook payload",
		"fabricated Codex-shaped payload",
	]);

	for (const gate of policy.automaticGates) {
		assert.equal(gate.status, "verified");
		assert.doesNotMatch(JSON.stringify(gate), /diagnostics/i);
		assertNoForbiddenSourceTerms(JSON.stringify(gate));
	}
	for (const gate of policy.experimentalGates) {
		assert.equal(gate.status, "experimental");
		assert.notEqual(gate.status, "verified");
	}
});

test("[todo8.gates.lsp-invocation] #given on-demand LSP gate #when inspected #then it uses only the local diagnostics invocation", () => {
	const [lspGate] = policy.onDemandGates;

	assert.equal(lspGate.id, "lsp-error-verification");
	assert.equal(lspGate.invocation.serverId, "lsp");
	assert.equal(lspGate.invocation.tool, "diagnostics");
	assert.deepEqual(lspGate.invocation.arguments, {
		filePath: "<absolute changed file>",
		severity: "error",
	});
	assert.equal(lspGate.messages.clean, "LSP verification: clean (<file>)");
	assert.equal(lspGate.messages.diagnostics, "LSP verification: <N> error(s) (<file>)");
	assert.equal(lspGate.messages.unavailable, "LSP verification unavailable: <reason>");
	assert.equal(lspGate.locationLimit, 5);
	assert.deepEqual(policy.publishingWorkflows, workflowFiles);
	assertNoForbiddenSourceTerms(JSON.stringify(policy));
	assert.doesNotMatch(JSON.stringify(policy), new RegExp(unsupportedMcpPrefix));
});

test("[todo8.gates.fixtures] #given clean diagnostic and unavailable fixtures #when formatted #then exact user text and failure behavior are enforced", () => {
	const clean = readJson("test/fixtures/lsp/clean.json");
	const diagnostics = readJson("test/fixtures/lsp/diagnostics.json");
	const unavailable = readJson("test/fixtures/lsp/unavailable.json");

	assert.equal(renderLspVerification(clean), clean.expectedUserText);
	assert.equal(renderLspVerification(diagnostics), diagnostics.expectedUserText);
	assert.equal(renderLspVerification(unavailable), unavailable.expectedUserText);
	assert.doesNotMatch(renderLspVerification(unavailable), /\bclean\b/);
	assert.equal(assertFixtureInvocation(clean), true);
	assert.equal(assertFixtureInvocation(diagnostics), true);
	assert.equal(assertFixtureInvocation(unavailable), true);
});

test("[todo8.gates.location-sanitization] #given diagnostic fixture output #when rendered #then locations are bounded and workspace-relative", () => {
	const diagnostics = readJson("test/fixtures/lsp/diagnostics.json");
	const rendered = renderLspVerification(diagnostics);
	const locationLines = rendered.split("\n").filter((line) => line.startsWith("- "));

	assert(locationLines.length > 0);
	assert(locationLines.length <= policy.onDemandGates[0].locationLimit);
	for (const line of locationLines) {
		assert.match(line, /^- src\/broken\.ts:\d+:\d+ /);
		assert.doesNotMatch(line, /C:|\\\\|file:|\.{2}/);
		assert(line.length <= 180);
	}
});

test("[todo8.gates.failure-probes] #given unsupported diagnostics inputs #when simulated #then none can produce clean verification", () => {
	const probes = [
		{ name: "missing server", payload: { tool: "diagnostics", arguments: { filePath: "C:/repo/src/file.ts", severity: "error" } } },
		{ name: "missing language server", payload: { serverId: "lsp", tool: "diagnostics", error: { reason: "language server unavailable" } } },
		{ name: "invalid path", payload: { serverId: "lsp", tool: "diagnostics", arguments: { filePath: "src/file.ts", severity: "error" } } },
		{ name: "unsupported post-tool event", payload: { serverId: "lsp", tool: "diagnostics", hook_event_name: unsupportedPostToolEvent } },
		{ name: "unsupported post-invocation event", payload: { serverId: "lsp", tool: "diagnostics", hook_event_name: unsupportedPostInvokeEvent } },
		{ name: "fake payload", payload: { serverId: "lsp", tool: "diagnostics", codex: { fake: true } } },
		{ name: "MCP double-underscore syntax", payload: { serverId: `${unsupportedMcpPrefix}lsp`, tool: `${unsupportedMcpPrefix}lsp${unsupportedMcpPrefix}diagnostics` } },
	];

	for (const probe of probes) {
		assert.equal(canProduceCleanVerification(probe.payload), false, probe.name);
	}
});

test("[todo8.gates.workflow-mappings] #given publishing workflow skills #when inspected #then each maps post-edit verification to the policy and fixtures semantically", () => {
	for (const workflowFile of workflowFiles) {
		const content = readText(workflowFile);

		assert.match(content, /Verified quality-gate policy/);
		assert.match(content, /server id `lsp`, tool `diagnostics`/);
		assert.match(content, /\{filePath:"<absolute changed file>",severity:"error"\}/);
		assert.match(content, /test\/fixtures\/lsp\/clean\.json/);
		assert.match(content, /test\/fixtures\/lsp\/diagnostics\.json/);
		assert.match(content, /test\/fixtures\/lsp\/unavailable\.json/);
		assert.match(content, /LSP verification: clean \(<file>\)/);
		assert.match(content, /LSP verification: <N> error\(s\) \(<file>\)/);
		assert.match(content, /LSP verification unavailable: <reason>/);
		assert.doesNotMatch(content, new RegExp(unsupportedMcpPrefix));
		assertNoForbiddenSourceTerms(content);
	}
});

test("[todo8.gates.no-unsupported-payload-labels] #given checked-in policy sources #when scanned #then unsupported automatic payload labels are absent", () => {
	const sourceFiles = [
		"config/verified-gates.json",
		"test/fixtures/lsp/clean.json",
		"test/fixtures/lsp/diagnostics.json",
		"test/fixtures/lsp/unavailable.json",
		...workflowFiles,
	];

	for (const sourceFile of sourceFiles) {
		const content = readText(sourceFile);
		assertNoForbiddenSourceTerms(content, sourceFile);
		assert.doesNotMatch(content, new RegExp(unsupportedMcpPrefix), sourceFile);
	}
});

function renderLspVerification(fixture) {
	if (fixture.error?.reason) return policy.onDemandGates[0].messages.unavailable.replace("<reason>", sanitizeReason(fixture.error.reason));
	if (!Array.isArray(fixture.diagnostics)) return "LSP verification unavailable: diagnostics result missing";
	const relFile = sanitizeFile(fixture.arguments.filePath);
	if (fixture.diagnostics.length === 0) return policy.onDemandGates[0].messages.clean.replace("<file>", relFile);
	const header = policy.onDemandGates[0].messages.diagnostics
		.replace("<N>", String(fixture.diagnostics.length))
		.replace("<file>", relFile);
	const locations = fixture.diagnostics
		.slice(0, policy.onDemandGates[0].locationLimit)
		.map((diagnostic) => `- ${sanitizeFile(diagnostic.file)}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} ${sanitizeMessage(diagnostic.message)}`);
	return [header, ...locations].join("\n");
}

function canProduceCleanVerification(payload) {
	if (payload.serverId !== "lsp") return false;
	if (payload.tool !== "diagnostics") return false;
	if (payload.hook_event_name === unsupportedPostToolEvent || payload.hook_event_name === unsupportedPostInvokeEvent) return false;
	if (payload.codex?.fake === true) return false;
	if (payload.error?.reason) return false;
	if (!payload.arguments || payload.arguments.severity !== "error") return false;
	if (payload.arguments.filePath !== "<absolute changed file>" && !isAbsolute(payload.arguments.filePath)) return false;
	return Array.isArray(payload.diagnostics) && payload.diagnostics.length === 0;
}

function assertNoForbiddenSourceTerms(content, label = "content") {
	for (const term of forbiddenSourceTerms) {
		assert(!content.includes(term), `${label} must not include ${term}`);
	}
}

function assertFixtureInvocation(fixture) {
	assert.equal(fixture.serverId, "lsp");
	assert.equal(fixture.tool, "diagnostics");
	assert.equal(fixture.arguments.severity, "error");
	assert.equal(isAbsolute(fixture.arguments.filePath), true);
	return true;
}

function sanitizeFile(filePath) {
	return relative("C:/repo", filePath).split(sep).join("/");
}

function sanitizeMessage(message) {
	return String(message).replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").slice(0, 120);
}

function sanitizeReason(reason) {
	return String(reason).replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "").slice(0, 120);
}

function readJson(path) {
	return JSON.parse(readText(path));
}

function readText(path) {
	return readFileSync(new URL(path, `${import.meta.url}/../../`), "utf8");
}
