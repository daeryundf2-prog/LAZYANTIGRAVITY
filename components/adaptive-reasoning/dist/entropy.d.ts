/**
 * Multi-path reasoning entropy and semantic contradiction analysis (Section 4.3)
 */
export interface EntropyEvaluation {
    entropy: number;
    pathCount: number;
    conflicting: boolean;
    agreementRatio: number;
    triggerSearch: boolean;
    reasons: string[];
}
export declare const POSITIVE_VERDICTS: RegExp;
export declare const NEGATIVE_VERDICTS: RegExp;
/**
 * Evaluates Shannon entropy across multiple reasoning paths / hypotheses (Section 4.3).
 * When reasoning paths diverge or produce contradictory verdicts, entropy rises and triggers search.
 */
export declare function evaluateHypothesisEntropy(hypotheses: string[]): EntropyEvaluation;
