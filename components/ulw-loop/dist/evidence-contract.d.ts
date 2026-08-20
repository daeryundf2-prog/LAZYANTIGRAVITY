/**
 * Strict Evidence Verification Contract
 * Prevents automated completion on unverified, partial, or inferred evidence.
 */
export type EvidenceStatus = "verified" | "partial" | "not_checked" | "inference";
export interface EvidenceRange {
    readonly file: string;
    readonly startLine?: number;
    readonly endLine?: number;
}
export interface StrictEvidenceEnvelope {
    readonly status: EvidenceStatus;
    readonly summary: string;
    readonly readRanges?: readonly EvidenceRange[];
    readonly unreadRanges?: readonly EvidenceRange[];
    readonly unknowns?: readonly string[];
    readonly inferences?: readonly string[];
    readonly filesChanged?: readonly string[];
    readonly commandsRun?: readonly string[];
    readonly dryRunSafety?: boolean;
}
export interface EvidenceValidationResult {
    readonly valid: boolean;
    readonly error?: string;
    readonly envelope?: StrictEvidenceEnvelope;
}
export declare function isStrictEvidenceStatus(status: unknown): status is EvidenceStatus;
export declare function validateStrictEvidence(evidence: unknown): EvidenceValidationResult;
