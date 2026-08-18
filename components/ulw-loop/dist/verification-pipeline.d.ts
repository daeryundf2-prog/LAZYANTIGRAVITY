import { type ConsensusResultEnvelope, type QualityGateResult, type VerificationContext, type VerificationPolicy } from "./verification-pipeline-types.js";
import { runMechanicalGate, runSemanticGate } from "./verification-gates.js";
export type { VerificationContext };
export { runMechanicalGate, runSemanticGate, };
export declare function loadVerificationPolicy(repoRoot: string): Promise<VerificationPolicy>;
export declare function calculateQualityFingerprint(evidence?: VerificationContext["evidence"]): string;
export declare function validateConsensusResultEnvelope(envelope: unknown, expectedRunId: string, expectedConsensusId: string): ConsensusResultEnvelope;
export declare function calculateConsensusVerdict(results: ConsensusResultEnvelope[]): {
    type: string;
    finalizerAllowed: boolean;
    parentActionRequired?: boolean;
};
export declare function runConsensusGate(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult;
export declare function runVerificationPipeline(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult[];
