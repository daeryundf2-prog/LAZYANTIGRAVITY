import type { StrictEvidenceEnvelope } from "./evidence-contract.js";
export interface EvidenceDraftResult {
    readonly draftPath: string;
    readonly envelope: StrictEvidenceEnvelope;
    readonly warnings: readonly string[];
}
export declare function buildEvidenceDraft(repoRoot: string, runId: string, goalId?: string): Promise<EvidenceDraftResult>;
