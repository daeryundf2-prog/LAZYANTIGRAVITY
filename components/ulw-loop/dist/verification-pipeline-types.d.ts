import type { LedgerEvent, QualityEvidenceEnvelope } from "./control-plane-types.js";
export type VerificationStage = "mechanical" | "semantic" | "consensus" | "evidence_completeness";
export type VerificationStatus = "passed" | "failed" | "skipped" | "required" | "blocked";
export interface VerificationPolicy {
    requireTests: boolean;
    requireLint: boolean;
    requireFactualityScore?: boolean;
    minFactualityScore?: number;
    requireCoveVerification?: boolean;
    consensusTriggers: {
        riskLevelHigh: boolean;
        destructiveChange: boolean;
        publicRelease: boolean;
        securitySensitive: boolean;
    };
}
export declare const DEFAULT_VERIFICATION_POLICY: VerificationPolicy;
export interface QualityGateResult {
    stage: VerificationStage;
    status: VerificationStatus;
    reason?: string;
    parentActionRequired?: boolean;
}
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
export type ConsensusPersona = "advocate" | "devils_advocate" | "regression_reviewer" | "security_state_reviewer";
export interface ConsensusRoleEnvelope {
    runId: string;
    consensusId: string;
    agentId: string;
    persona: ConsensusPersona;
    mayFinalizeRun: false;
    mayModifyGlobalRunState: false;
    mayChangeModel: false;
    wouldSwitchModel: false;
    requiresParentAck: true;
    mustReturn: "ConsensusResultEnvelope";
}
export interface ConsensusResultEnvelope {
    runId: string;
    consensusId: string;
    agentId: string;
    persona: ConsensusPersona;
    verdict: "approve" | "reject" | "needs_rework" | "inconclusive";
    reason: string;
    requiresParentAck: true;
}
