/**
 * Human-In-The-Loop (HITL) Interactive Decision Bridge
 * Formats decision-complete payloads and resolves blocked workflows.
 */
import type { UlwLoopItem, UlwLoopPlan } from "./types.js";
export interface HitlOption {
    readonly id: "retry" | "override" | "abort";
    readonly label: string;
    readonly description: string;
}
export interface HitlDecisionCard {
    readonly goalId: string;
    readonly goalObjective: string;
    readonly blockerSignature: string;
    readonly occurrences: number;
    readonly rootReason: string;
    readonly availableOptions: readonly HitlOption[];
    readonly suggestedAction: "retry" | "override" | "abort";
}
export declare function buildHitlDecisionCard(goal: UlwLoopItem, reason: string): HitlDecisionCard;
export declare function applyHitlDecision(plan: UlwLoopPlan, goalId: string, decision: "retry" | "override" | "abort", rationale?: string): UlwLoopItem;
