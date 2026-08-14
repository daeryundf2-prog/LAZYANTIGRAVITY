import { type UlwLoopScope } from "./paths.js";
import type { UlwLoopAggregateCompletion, UlwLoopItem, UlwLoopPlan, UlwLoopQualityGate } from "./types.js";
export interface CheckpointQualityGateResult {
    readonly finalizerAllowed: boolean;
    readonly qualityGate?: UlwLoopQualityGate | undefined;
    readonly codexGoal?: unknown;
    readonly aggregateCompletion?: UlwLoopAggregateCompletion | undefined;
    readonly goalStatusOverride?: UlwLoopItem["status"] | undefined;
    readonly blockedReasonOverride?: string | undefined;
    readonly failedReasonOverride?: string | undefined;
}
export declare function runCheckpointQualityGate(repoRoot: string, goal: UlwLoopItem, plan: UlwLoopPlan, evidence: string, args: {
    readonly codexGoalJson?: string;
    readonly qualityGateJson?: string;
}, now: string, scope?: UlwLoopScope): Promise<CheckpointQualityGateResult>;
