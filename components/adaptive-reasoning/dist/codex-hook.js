import { computeThinkingBudget, formatThinkingBudgetDirective } from "./budget-scaler.js";
import { computeUncertainty, formatUncertaintyDirective } from "./uncertainty.js";
export function handleUserPromptSubmitHook(inputJson) {
    try {
        const parsed = JSON.parse(inputJson);
        const prompt = parsed.prompt || "";
        const decision = computeThinkingBudget(prompt);
        const uncertainty = computeUncertainty(prompt);
        const directives = [];
        if (decision.level !== "off") {
            directives.push(formatThinkingBudgetDirective(decision));
        }
        if (uncertainty.triggerSearch) {
            directives.push(formatUncertaintyDirective(uncertainty));
        }
        return JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: directives.join("\n\n"),
            },
        });
    }
    catch (err) {
        return JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: "",
            },
        });
    }
}
