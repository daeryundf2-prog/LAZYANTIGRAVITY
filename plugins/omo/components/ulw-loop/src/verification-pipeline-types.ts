export type VerificationStage = "mechanical" | "semantic" | "consensus";

export type VerificationStatus = "passed" | "failed" | "skipped" | "required" | "blocked";

export interface VerificationPolicy {
	requireTests: boolean;
	requireLint: boolean;
	consensusTriggers: {
		riskLevelHigh: boolean;
		destructiveChange: boolean;
		publicRelease: boolean;
		securitySensitive: boolean;
	};
}

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
	requireTests: true,
	requireLint: true,
	consensusTriggers: {
		riskLevelHigh: true,
		destructiveChange: true,
		publicRelease: true,
		securitySensitive: true,
	},
};

export interface QualityGateResult {
	stage: VerificationStage;
	status: VerificationStatus;
	reason?: string;
	parentActionRequired?: boolean;
}
