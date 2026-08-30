import type { StrictEvidenceEnvelope } from "./evidence-contract.js";
export interface EvidenceDraftResult {
    readonly draftPath: string;
    readonly envelope: StrictEvidenceEnvelope;
    readonly warnings: readonly string[];
}
/**
 * Scaffolds a strict evidence envelope from the run ledger so the agent only
 * has to verify (and fill command truths) instead of hand-assembling the
 * contract. Everything file-related is computed from the real disk; command
 * audits and the execution binding are placeholders the submitting agent is
 * accountable for — the checkpoint gate re-verifies every disk-verifiable
 * claim at submission time.
 */
export declare function buildEvidenceDraft(repoRoot: string, runId: string, goalId?: string): Promise<EvidenceDraftResult>;
