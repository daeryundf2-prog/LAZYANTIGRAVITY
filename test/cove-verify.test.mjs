import assert from "node:assert/strict";
import test from "node:test";
import { executeVerification, planVerificationQuestions, synthesizeVerifiedOutput } from "../scripts/cove_verify.mjs";

test("planVerificationQuestions extracts 3-5 factual verification questions from draft (Feature 06)", () => {
	const draft = `
React 19 was released in 2024.
It supports automatic compiler optimization.
Node.js v24 is the current runtime version.
TypeScript 6 is enforced across components.
`;
	const questions = planVerificationQuestions(draft);
	assert.ok(questions.length >= 3);
	assert.ok(questions.length <= 5);
	assert.ok(questions.some((q) => q.target_claim.includes("React 19") || q.target_claim.includes("2024")));
});

test("synthesizeVerifiedOutput corrects contradictions when verified facts conflict", () => {
	const draft = "The project uses Python 2.7 as the primary runtime.";
	const questions = planVerificationQuestions(draft);
	const executed = executeVerification(questions, (q, claim) => {
		if (claim.includes("Python 2.7")) {
			return { answer: "Node.js >=20 is the primary runtime", is_consistent: false };
		}
		return { answer: "Verified", is_consistent: true };
	});

	const result = synthesizeVerifiedOutput(draft, executed);
	assert.equal(result.all_verified, false);
	assert.equal(result.contradictions_found, 1);
	assert.ok(result.verified_output.includes("CoVe Verification Corrections"));
	assert.ok(result.verified_output.includes("Node.js >=20"));
});

test("cove_verify CLI runs with --json and blocks contradictions with --strict", async () => {
	const { spawnSync } = await import("node:child_process");
	const { mkdtempSync, writeFileSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { fileURLToPath } = await import("node:url");

	const SCRIPT = fileURLToPath(new URL("../scripts/cove_verify.mjs", import.meta.url));
	const dir = mkdtempSync(join(tmpdir(), "cove-"));
	const draftFile = join(dir, "draft.md");
	writeFileSync(draftFile, "React 19 was released in 2024.\nTypeScript 6 is enforced.\n", "utf8");

	// 1. JSON mode passes when verified
	const resJson = spawnSync("node", [SCRIPT, draftFile, "--json"], { encoding: "utf8" });
	assert.equal(resJson.status, 0);
	const data = JSON.parse(resJson.stdout);
	assert.equal(data.all_verified, true);
	assert.ok(data.total_verification_questions >= 2);

	// 2. KB mismatch in strict mode blocks with exit 1
	const badDraft = join(dir, "bad_draft.md");
	writeFileSync(badDraft, "The fake hallucinated module v99 was created in 2030.\n", "utf8");
	const kbFile = join(dir, "kb.txt");
	writeFileSync(kbFile, "Official modules: core-v1, core-v2.", "utf8");

	const resStrict = spawnSync("node", [SCRIPT, badDraft, "--kb", kbFile, "--strict"], { encoding: "utf8" });
	assert.equal(resStrict.status, 1);
	assert.match(resStrict.stderr, /STRICT GATE FAILURE/);
});

test("ulw-loop semantic gate validates requireCoveVerification and coveVerified status", async () => {
	const { runSemanticGate } = await import("../components/ulw-loop/dist/verification-gates.js");
	const baseCtx = {
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
		}
	};

	// 1. Failed when coveVerified is explicitly false
	const resFalse = runSemanticGate({
		...baseCtx,
		evidence: { ...baseCtx.evidence, coveVerified: false }
	});
	assert.equal(resFalse.status, "failed");
	assert.match(resFalse.reason, /CoVe verification failed/);

	// 2. Failed when policy requires CoVe but not verified
	const resRequired = runSemanticGate(baseCtx, {
		requireTests: false,
		requireLint: false,
		requireCoveVerification: true,
		consensusTriggers: { riskLevelHigh: false, destructiveChange: false, publicRelease: false, securitySensitive: false }
	});
	assert.equal(resRequired.status, "failed");
	assert.match(resRequired.reason, /Policy requires CoVe verification/);

	// 3. Passed when coveVerified is true
	const resPassed = runSemanticGate({
		...baseCtx,
		evidence: { ...baseCtx.evidence, coveVerified: true }
	}, {
		requireTests: false,
		requireLint: false,
		requireCoveVerification: true,
		consensusTriggers: { riskLevelHigh: false, destructiveChange: false, publicRelease: false, securitySensitive: false }
	});
	assert.equal(resPassed.status, "passed");
});
