import { type CheckpointQualityGateResult } from "./checkpoint-reconciliation.js";
import { type UlwLoopScope } from "./paths.js";
import type { UlwLoopItem, UlwLoopPlan } from "./types.js";
export type { CheckpointQualityGateResult };
export declare function runCheckpointQualityGate(repoRoot: string, goal: UlwLoopItem, plan: UlwLoopPlan, evidence: string, args: {
    readonly codexGoalJson?: string;
    readonly qualityGateJson?: string;
}, now: string, scope?: UlwLoopScope): Promise<CheckpointQualityGateResult>;
