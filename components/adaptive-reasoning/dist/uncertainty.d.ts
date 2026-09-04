/**
 * Med-Gemini inspired Uncertainty-Guided Search Trigger (Section 4.3 / Feature 08)
 * Evaluates epistemic uncertainty and multi-path reasoning entropy to trigger
 * external grounding when confidence is low or hypotheses diverge.
 */
export interface EntropyEvaluation {
    entropy: number;
    pathCount: number;
    conflicting: boolean;
    agreementRatio: number;
    triggerSearch: boolean;
    reasons: string[];
}
export interface UncertaintyEvaluation {
    score: number;
    level: "low" | "medium" | "high";
    triggerSearch: boolean;
    reasons: string[];
    entropyEvaluation?: EntropyEvaluation;
}
/**
 * Evaluates Shannon entropy across multiple reasoning paths / hypotheses (Section 4.3).
 * When reasoning paths diverge or produce contradictory verdicts, entropy rises and triggers search.
 */
export declare function evaluateHypothesisEntropy(hypotheses: string[]): EntropyEvaluation;
export declare function computeUncertainty(prompt: string): UncertaintyEvaluation;
/**
 * Blends prompt epistemic uncertainty with multi-path reasoning entropy (Section 4.3).
 */
export declare function computeMultiPathUncertainty(prompt: string, reasoningPaths?: string[]): UncertaintyEvaluation;
export declare function formatUncertaintyDirective(evaluation: UncertaintyEvaluation): string;
/**
 * Enterprise Factuality Generation Configuration (Section 4.1 & 8)
 * Enforces zero-temperature deterministic inference and tight dynamic search threshold.
 */
export declare const FACTUALITY_GENERATION_CONFIG: {
    temperature: number;
    topP: number;
    topK: number;
    dynamicSearchThreshold: number;
};
export interface HighFidelityEvaluation {
    grounded: boolean;
    overlapRatio: number;
    missingEntities: string[];
    verdict: "PASS" | "FAIL";
}
/**
 * Local High-Fidelity non-parametric grounding verifier (Section 4.2).
 * Token-overlap gate only. No Vertex API call.
 */
export declare function evaluateHighFidelityGrounding(sourceDocument: string, modelResponse: string, minOverlapThreshold?: number): HighFidelityEvaluation;
