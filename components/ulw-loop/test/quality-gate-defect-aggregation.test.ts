import { describe, expect, it } from "vitest";
import { validateQualityGate } from "../src/quality-gate.js";
import { UlwLoopError } from "../src/types.js";

describe("Quality Gate Defect Aggregation (PR #7656)", () => {
	it("#given multiple quality gate defects #when validateQualityGate runs #then aggregates all defects into a single error", () => {
		const invalidGate = {
			qualityGate: {
				aiSlopCleaner: { status: "failed", evidence: "" },
				verification: { status: "passed", commands: [], evidence: "" },
				codeReview: { recommendation: "REJECT", architectStatus: "BLOCK", evidence: "" },
				criteriaCoverage: { totalCriteria: 5, passCount: 2, adversarialClassesCovered: [] },
			},
		};

		let thrownError: UlwLoopError | null = null;
		try {
			validateQualityGate(invalidGate);
		} catch (err) {
			if (err instanceof UlwLoopError) {
				thrownError = err;
			}
		}

		expect(thrownError).not.toBeNull();
		expect(thrownError?.code).toBe("ULW_LOOP_QUALITY_GATE_INVALID");
		expect(thrownError?.message).toContain("Final quality gate validation failed with");
		expect(thrownError?.message).toContain("[aiSlopCleaner.status]");
		expect(thrownError?.message).toContain("[verification.commands]");
		expect(thrownError?.message).toContain("[criteriaCoverage.passCount]");
		expect(thrownError?.message).toContain("[codeReview.recommendation]");

		const details = thrownError?.details as { defects?: string[] } | undefined;
		expect(details?.defects).toBeDefined();
		expect(details?.defects?.length).toBeGreaterThanOrEqual(4);
	});
});
