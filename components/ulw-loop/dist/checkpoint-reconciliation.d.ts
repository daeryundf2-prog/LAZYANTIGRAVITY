import { type UlwLoopScope } from "./paths.js";
import type { UlwLoopAggregateCompletion, UlwLoopItem, UlwLoopPlan, UlwLoopQualityGate } from "./types.js";
export declare function textMentionsUlwLoopPlanArtifact(value: string | undefined): boolean;
export declare function textMentionsGoalId(value: string | undefined, goalId: string): boolean;
export declare function textHasCompletionValidationEvidence(value: string | undefined): boolean;
export declare function snapshotObjectiveMapsToUlwLoopPlan(repoRoot: string, snapshotObjective: string, scope?: UlwLoopScope): Promise<boolean>;
export declare function canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot: string, plan: UlwLoopPlan, goal: UlwLoopItem, snapshotObjective: string, evidence: string, scope?: UlwLoopScope): Promise<boolean>;
export declare function canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot: string, plan: UlwLoopPlan, goal: UlwLoopItem, snapshotObjective: string, evidence: string, scope?: UlwLoopScope): Promise<boolean>;
export declare function buildCompletedLegacyGoalRemediation(goal: UlwLoopItem): string;
export declare function buildTaskScopedAggregateReconciliationHint(goal: UlwLoopItem, final: boolean): string;
export declare function readJsonInput(raw: string | undefined, repoRoot: string): Promise<unknown>;
export declare function makeAggregateCompletion(now: string, evidence: string, codexGoal: unknown): UlwLoopAggregateCompletion;
export interface CheckpointQualityGateResult {
    readonly finalizerAllowed: boolean;
    readonly qualityGate?: UlwLoopQualityGate | undefined;
    readonly codexGoal?: unknown;
    readonly aggregateCompletion?: UlwLoopAggregateCompletion | undefined;
    readonly goalStatusOverride?: UlwLoopItem["status"] | undefined;
    readonly blockedReasonOverride?: string | undefined;
    readonly failedReasonOverride?: string | undefined;
}
