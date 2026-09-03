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
