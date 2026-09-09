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
 */
export declare function verifyWalkthroughGroundTruth(repoRoot: string, walkthroughRelativePath?: string, events?: readonly LedgerEvent[]): WalkthroughVerificationResult;
import { type UlwLoopScope } from "./paths.js";
export declare function verifyWalkthroughCmd(repoRoot: string, argv: readonly string[], json: boolean, scope?: UlwLoopScope): Promise<number>;
