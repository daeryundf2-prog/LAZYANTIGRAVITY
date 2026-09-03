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

