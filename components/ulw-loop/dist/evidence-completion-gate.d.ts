import type { LedgerEvent, QualityEvidenceEnvelope } from "./control-plane-types.js";
export declare function assertGroundTruthEvidence(repoRoot: string, qualityGateJson: string | undefined, events: readonly LedgerEvent[], claimedEvidence?: QualityEvidenceEnvelope): Promise<void>;
