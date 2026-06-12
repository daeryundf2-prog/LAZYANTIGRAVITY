import type { LedgerEvent, QualityEvidenceEnvelope } from "./control-plane-types.js";
import { type ConsensusResultEnvelope, type QualityGateResult, type VerificationPolicy } from "./verification-pipeline-types.js";
export declare function loadVerificationPolicy(repoRoot: string): Promise<VerificationPolicy>;
export interface VerificationContext {
    runId: string;
    events: LedgerEvent[];
    evidence?: QualityEvidenceEnvelope;
    goal?: string;
    wouldSwitchModel?: boolean;
    isDryRun?: boolean;
    riskLevel?: "low" | "medium" | "high";
    destructiveChange?: boolean;
    publicRelease?: boolean;
    securitySensitive?: boolean;
    lspDiagnostics?: string[] | undefined;
    rulesViolations?: string[] | undefined;
}
export declare function runMechanicalGate(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult;
export declare function runSemanticGate(ctx: VerificationContext, _policy: VerificationPolicy): QualityGateResult;
export declare function runConsensusGate(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult;
export declare function validateConsensusResultEnvelope(envelope: unknown, expectedRunId: string, expectedConsensusId: string): ConsensusResultEnvelope;
export declare function calculateConsensusVerdict(results: ConsensusResultEnvelope[]): {
    type: string;
    finalizerAllowed: boolean;
    parentActionRequired?: boolean;
};
export declare function calculateQualityFingerprint(evidence: QualityEvidenceEnvelope): string;
export declare function runVerificationPipeline(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult[];
