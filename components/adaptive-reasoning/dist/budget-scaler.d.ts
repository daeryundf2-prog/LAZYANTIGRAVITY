export interface ThinkingBudgetDecision {
    budget: number;
    tier: "flash_lite" | "flash" | "pro";
    level: "off" | "standard" | "high" | "deep";
    rationale: string;
}
export declare function computeThinkingBudget(prompt: string): ThinkingBudgetDecision;
export declare function formatThinkingBudgetDirective(decision: ThinkingBudgetDecision): string;
