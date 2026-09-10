import type { LedgerEvent } from "./control-plane-types.js";
import type { StrictEvidenceEnvelope } from "./evidence-contract.js";
export interface GroundTruthAuditResult {
    readonly verified: boolean;
    readonly error?: string;
    readonly mismatchedFiles?: readonly string[];
    readonly nonZeroExitCommands?: readonly string[];
    readonly invalidLineRanges?: readonly string[];
    readonly placeholderReceipts?: readonly string[];
    readonly staleReceipts?: readonly string[];
}
export interface GroundTruthAuditOptions {
    readonly runStartedAtMs?: number;
    readonly minReceiptLength?: number;
}
export declare function computeFileSha256(filePath: string): string | null;
export declare function computeFileMtimeMs(filePath: string): number | null;
/**
 * Masks credentials, secrets, and auth tokens in logged URLs and command outputs.
 * Parameter matching is root-based (sig, pwd, passwd, credential also match the
 * "signature"/"password"/"credential" families) and case-insensitive, so
 * api-key/API-KEY/X-Api-Key variants cannot slip a secret into logs.
 */
export declare function sanitizeEvidenceUrls(text: string): string;
export declare function countFileLines(filePath: string): number | null;
export declare function verifyEvidenceGroundTruth(repoRoot: string, evidence: StrictEvidenceEnvelope, events?: readonly LedgerEvent[], options?: GroundTruthAuditOptions): GroundTruthAuditResult;
