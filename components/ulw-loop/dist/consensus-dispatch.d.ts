import type { DispatchConsensusOptions } from "./consensus-types.js";
export declare function dispatchConsensus(repoRoot: string, runId: string, qualityInputFingerprint?: string, options?: DispatchConsensusOptions): Promise<{
    consensusId: string;
}>;
export declare function reportConsensusResult(repoRoot: string, runId: string, consensusId: string, agentId: string, resultJson: unknown, isMockLive?: boolean, metrics?: {
    durationCreateSessionMs?: number;
    durationSendMessageMs?: number;
    durationPollMs?: number;
}): Promise<void>;
