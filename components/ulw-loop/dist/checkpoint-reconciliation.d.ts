import { type UlwLoopScope } from "./paths.js";
import type { UlwLoopItem, UlwLoopPlan } from "./types.js";
export declare function canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot: string, plan: UlwLoopPlan, goal: UlwLoopItem, snapshotObjective: string, evidence: string, scope?: UlwLoopScope): Promise<boolean>;
export declare function canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot: string, plan: UlwLoopPlan, goal: UlwLoopItem, snapshotObjective: string, evidence: string, scope?: UlwLoopScope): Promise<boolean>;
export declare function buildTaskScopedAggregateReconciliationHint(goal: UlwLoopItem, final: boolean): string;
