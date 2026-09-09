import type { LedgerEvent } from "./control-plane-types.js";
export interface WalkthroughVerificationResult {
    readonly ok: boolean;
    readonly walkthroughPath: string;
    readonly claimedFiles: readonly string[];
    readonly claimedCommands: readonly string[];
    readonly phantomFiles: readonly string[];
    readonly phantomCommands: readonly string[];
    readonly error?: string;
    readonly skipped?: boolean;
}
/**
 * Verifies that walkthrough.md only makes claims that match ground truth
 * attested in the ledger and verified file system.
 *
 * Command matching is exact-token only. Substring matching
 * (cmd.includes(attested)) previously let unattested commands pass whenever
 * they shared a fragment with an attested command line, which defeats the
 * purpose of phantom-command detection.
 */
export declare function verifyWalkthroughGroundTruth(repoRoot: string, walkthroughRelativePath?: string, events?: readonly LedgerEvent[]): WalkthroughVerificationResult;
