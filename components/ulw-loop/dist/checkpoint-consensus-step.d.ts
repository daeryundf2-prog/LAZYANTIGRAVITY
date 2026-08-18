import type { UlwLoopItem } from "./types.js";
export interface ConsensusStepResult {
    finalizerAllowed: boolean;
    goalStatusOverride?: UlwLoopItem["status"] | undefined;
    blockedReasonOverride?: string | undefined;
    failedReasonOverride?: string | undefined;
}
export declare function runCheckpointConsensusStep(repoRoot: string, runId: string, fingerprint: string, goal: UlwLoopItem, lspDiagnostics: string[], rulesViolations: string[]): Promise<ConsensusStepResult>;
