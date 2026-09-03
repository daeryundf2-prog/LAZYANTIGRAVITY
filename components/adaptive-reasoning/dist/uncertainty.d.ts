/**
 * Med-Gemini inspired Uncertainty-Guided Search Trigger (Feature 08)
 * Evaluates epistemic uncertainty and triggers external grounding when confidence is low.
 */
export interface UncertaintyEvaluation {
    score: number;
    level: "low" | "medium" | "high";
    triggerSearch: boolean;
    reasons: string[];
}
export declare function computeUncertainty(prompt: string): UncertaintyEvaluation;
export declare function formatUncertaintyDirective(evaluation: UncertaintyEvaluation): string;
