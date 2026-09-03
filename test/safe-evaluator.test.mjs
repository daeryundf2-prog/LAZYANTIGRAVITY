import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decomposeAtomicFacts, evaluateAtomicFacts, generateVerificationQuery } from "../scripts/safe_evaluator.mjs";

test("decomposeAtomicFacts splits complex sentences into atomic propositions (Feature 01)", () => {
	const text = "Gemini 3.7은 사고 모드를 지원한다. 또한 200만 토큰 컨텍스트를 제공한다.";
	const facts = decomposeAtomicFacts(text);
	assert.ok(facts.length >= 2);
	assert.ok(facts.some((f) => f.proposition.includes("사고 모드")));
	assert.ok(facts.some((f) => f.proposition.includes("200만 토큰")));
});

test("generateVerificationQuery strips particles and isolates key entities", () => {
	const query = generateVerificationQuery("React 19 버전의 릴리즈 날짜는 2024년이다");
	assert.match(query, /React/);
	assert.match(query, /19/);
	assert.match(query, /2024/);
});

test("evaluateAtomicFacts scores supported vs refuted facts accurately", () => {
	const facts = [
		{ id: "AF-001", proposition: "TypeScript 6 strict mode is supported", verification_query: "TypeScript 6 strict" },
		{ id: "AF-002", proposition: "Fake nonexistent hallucinated API v99", verification_query: "Fake nonexistent" }
	];
	const kb = "The codebase uses TypeScript 6 in strict mode for all components.";

	const result = evaluateAtomicFacts(facts, kb);
	assert.equal(result.total_atomic_facts, 2);
	assert.equal(result.supported_count, 1);
	assert.equal(result.refuted_count, 1);
	assert.equal(result.factuality_score, 0.5);
});

test("safe_evaluator CLI runs and blocks low factuality in --strict mode", () => {
	const SCRIPT = fileURLToPath(new URL("../scripts/safe_evaluator.mjs", import.meta.url));
	const dir = mkdtempSync(join(tmpdir(), "safe-"));
	const badFile = join(dir, "bad.md");
	writeFileSync(badFile, "Fake hallucinated claim 1.\nFake nonexistent claim 2.\n", "utf8");

	const res = spawnSync("node", [SCRIPT, badFile, "--strict"], { encoding: "utf8" });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /STRICT GATE FAILURE/);
});

test("evaluateAtomicFacts classifies [UNVERIFIED] and [INSUFFICIENT_DATA] as Unclear", () => {
	const facts = [
		{ id: "AF-001", proposition: "[UNVERIFIED: author of algorithm]", verification_query: "author algorithm" },
		{ id: "AF-002", proposition: "[INSUFFICIENT_DATA: missing exact date]", verification_query: "exact date" }
	];
	const result = evaluateAtomicFacts(facts);
	assert.equal(result.unclear_count, 2);
	assert.equal(result.supported_count, 0);
	assert.equal(result.refuted_count, 0);
});

test("ulw-loop semantic gate blocks when evidence factualityScore is below 85%", async () => {
	const { runSemanticGate } = await import("../components/ulw-loop/dist/verification-gates.js");
	const ctx = {
		runId: "test-run",
		events: [],
		goal: "Test goal",
		evidence: {
			goal: "Test goal",
			summary: "Summary text",
			filesChanged: [],
			commandsRun: [],
			testResults: [],
			artifactsGenerated: [],
			completedRoles: [],
			acknowledgedRoles: [],
			dryRunSafety: false,
			factualityScore: 0.72
		}
	};
	const res = runSemanticGate(ctx, {});
	assert.equal(res.status, "failed");
	assert.match(res.reason, /SAFE factuality score \(72\.0%\) is below required 85% threshold/);
});

test("safe_evaluator CLI outputs JSON with --json flag", () => {
	const SCRIPT = fileURLToPath(new URL("../scripts/safe_evaluator.mjs", import.meta.url));
	const dir = mkdtempSync(join(tmpdir(), "safe-json-"));
	const testFile = join(dir, "doc.md");
	writeFileSync(testFile, "Gemini 3.7 supports thinking mode.\nIt has 2M tokens context.\n", "utf8");

	const res = spawnSync("node", [SCRIPT, testFile, "--json"], { encoding: "utf8" });
	assert.equal(res.status, 0);
	const data = JSON.parse(res.stdout);
	assert.ok(data.total_atomic_facts >= 2);
	assert.ok(typeof data.factuality_score === "number");
	assert.ok(data.factuality_score >= 0.85);
});

test("ulw-loop CLI exposes cove-verify and safe-eval subcommands", () => {
	const CLI = fileURLToPath(new URL("../components/ulw-loop/dist/cli.js", import.meta.url));
	const dir = mkdtempSync(join(tmpdir(), "ulw-cli-"));
	const testFile = join(dir, "eval_target.md");
	writeFileSync(testFile, "React 19 was launched in 2024.\nTypeScript 6 is enforced.\n", "utf8");

	// 1. ulw-loop safe-eval
	const resSafe = spawnSync("node", [CLI, "ulw-loop", "safe-eval", testFile, "--json"], { encoding: "utf8" });
	assert.equal(resSafe.status, 0, resSafe.stderr);
	const safeData = JSON.parse(resSafe.stdout);
	assert.ok(safeData.total_atomic_facts >= 2);

	// 2. ulw-loop cove-verify
	const resCove = spawnSync("node", [CLI, "ulw-loop", "cove-verify", testFile, "--json"], { encoding: "utf8" });
	assert.equal(resCove.status, 0, resCove.stderr);
	const coveData = JSON.parse(resCove.stdout);
	assert.equal(coveData.all_verified, true);
});

test("markdown_structure_guard and json_schema_guard recognize TargetFile parameter", () => {
	const MD_GUARD = fileURLToPath(new URL("../scripts/markdown_structure_guard.mjs", import.meta.url));
	const JSON_GUARD = fileURLToPath(new URL("../scripts/json_schema_guard.mjs", import.meta.url));
	const dir = mkdtempSync(join(tmpdir(), "targetfile-"));

	// 1. markdown guard with TargetFile key
	const brokenMd = join(dir, "broken.md");
	writeFileSync(brokenMd, "# Title\n-  : empty label\n", "utf8");
	const resMd = spawnSync("node", [MD_GUARD], {
		input: JSON.stringify({ TargetFile: brokenMd, CodeContent: "# Title\n-  : empty label\n" }),
		encoding: "utf8",
	});
	assert.equal(resMd.status, 1);
	assert.match(resMd.stderr, /MARKDOWN GUARD/);

	// 2. json schema guard with TargetFile key
	const brokenJson = join(dir, "invalid.json");
	writeFileSync(brokenJson, '{"name": "test", "version": "invalid-not-semver"}', "utf8");
	const resJson = spawnSync("node", [JSON_GUARD], {
		input: JSON.stringify({ TargetFile: brokenJson, CodeContent: '{"name": "test", "version": "invalid-not-semver"}' }),
		encoding: "utf8",
	});
	assert.equal(resJson.status, 1);
	assert.match(resJson.stderr, /JSON SCHEMA GUARD/);
});


