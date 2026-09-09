import type { UlwLoopPlan } from "./types.js";
/**
 * Renders an immutable <session-goal> anchor block to survive context compaction
 * and prevent goal drift across long-running turns (PR #7238).
 */
export declare function renderSessionGoalAnchor(plan: UlwLoopPlan): string;
