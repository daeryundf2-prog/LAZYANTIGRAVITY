/**
 * Strict Evidence Verification Contract
 * Prevents automated completion on unverified, partial, or fabricated evidence.
 */
export type EvidenceStatus = "verified" | "partial" | "not_checked" | "inference";
export interface EvidenceRange {
    readonly file: string;
    readonly startLine?: number;
    readonly endLine?: number;
}
export interface FileChecksum {
    readonly file: string;
    readonly sha256: string;
}
export interface CommandExecutionAudit {
    readonly command: string;
    readonly exitCode?: number;
    readonly outputSnippet?: string;
}
export interface ExecutionBinding {
    readonly requestId: string;
    readonly runId: string;
    readonly sessionId: string;
    readonly toolCallId: string;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly exitCode: number;
    readonly stdoutFingerprint: string;
    readonly stderrFingerprint: string;
}
export interface StrictEvidenceEnvelope {
    readonly status: EvidenceStatus;
    readonly summary: string;
    readonly workspaceRoot?: string;
    readonly readRanges?: readonly EvidenceRange[];
    readonly unreadRanges?: readonly EvidenceRange[];
    readonly unknowns?: readonly string[];
    readonly inferences?: readonly string[];
    readonly filesChanged?: readonly string[];
    readonly fileChecksums?: readonly FileChecksum[];
    readonly commandsRun?: readonly string[];
    readonly commandAudits?: readonly CommandExecutionAudit[];
    readonly executionBinding?: ExecutionBinding;
    readonly dryRunSafety?: boolean;
}
export interface EvidenceValidationResult {
    readonly valid: boolean;
    readonly error?: string;
    readonly envelope?: StrictEvidenceEnvelope;
}
export declare function isStrictEvidenceStatus(status: unknown): status is EvidenceStatus;
export declare function validateStrictEvidence(evidence: unknown): EvidenceValidationResult;
