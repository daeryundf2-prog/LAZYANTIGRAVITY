import { describe, expect, it } from "vitest";
import type { LedgerEvent, QualityEvidenceEnvelope } from "../src/control-plane-types.js";
import { runVerificationPipeline, type VerificationContext } from "../src/verification-pipeline.js";
import { DEFAULT_VERIFICATION_POLICY } from "../src/verification-pipeline-types.js";

const mockEvidence: QualityEvidenceEnvelope = {
	goal: "Fix bug",
	summary: "Completed work",
	filesChanged: ["src/index.ts"],
	commandsRun: ["npm test"],
	testResults: ["1 pass"],
	artifactsGenerated: [],
	completedRoles: ["worker"],
	acknowledgedRoles: [],
	dryRunSafety: true,
};

describe("Verification Pipeline", () => {
	it("should pass mechanical and semantic gates on happy path", () => {
		const ctx: VerificationContext = {
			runId: "run-1",
			events: [],
			evidence: mockEvidence,
			goal: "Fix bug",
		};

		const results = runVerificationPipeline(ctx, DEFAULT_VERIFICATION_POLICY);
		expect(results.length).toBe(3);
		expect(results[0]?.status).toBe("passed");
		expect(results[0]?.stage).toBe("mechanical");
		expect(results[1]?.status).toBe("passed");
		expect(results[1]?.stage).toBe("semantic");
		expect(results[2]?.status).toBe("skipped");
		expect(results[2]?.stage).toBe("consensus");
	});

	it("should fail mechanical if tests are required but no commands run", () => {
		const ctx: VerificationContext = {
			runId: "run-1",
			events: [],
			evidence: { ...mockEvidence, commandsRun: [] },
			goal: "Fix bug",
		};

		const results = runVerificationPipeline(ctx, DEFAULT_VERIFICATION_POLICY);
		expect(results.length).toBe(1);
		expect(results[0]?.status).toBe("failed");
		expect(results[0]?.stage).toBe("mechanical");
		expect(results[0]?.parentActionRequired).toBe(true);
	});

	it("should fail semantic if goal is missing", () => {
		const ctx: VerificationContext = {
			runId: "run-1",
			events: [],
			evidence: mockEvidence,
			goal: "", // empty
		};

		const results = runVerificationPipeline(ctx, DEFAULT_VERIFICATION_POLICY);
		expect(results.length).toBe(2);
		expect(results[1]?.status).toBe("failed");
		expect(results[1]?.stage).toBe("semantic");
	});

	it("should fail semantic if unresolved stagnation event exists", () => {
		const stagnationEvent: LedgerEvent = {
			timestamp: new Date().toISOString(),
			type: "parent.stagnation_detected",
			runId: "run-1",
			fingerprint: "stagnation-hash-123",
		};
		const ctx: VerificationContext = {
			runId: "run-1",
			events: [stagnationEvent],
			evidence: mockEvidence,
			goal: "Fix bug",
		};

		const results = runVerificationPipeline(ctx, DEFAULT_VERIFICATION_POLICY);
		expect(results.length).toBe(2);
		expect(results[1]?.status).toBe("failed");
		expect(results[1]?.stage).toBe("semantic");
		expect(results[1]?.reason).toContain("Unresolved stagnation detected");
	});

	it("should require consensus if risk level is high", () => {
		const ctx: VerificationContext = {
			runId: "run-1",
			events: [],
			evidence: mockEvidence,
			goal: "Fix bug",
			riskLevel: "high",
		};

		const results = runVerificationPipeline(ctx, DEFAULT_VERIFICATION_POLICY);
		expect(results.length).toBe(3);
		expect(results[2]?.status).toBe("required");
		expect(results[2]?.stage).toBe("consensus");
		expect(results[2]?.parentActionRequired).toBe(true);
	});
});
