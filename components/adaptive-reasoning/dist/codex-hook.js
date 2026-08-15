import { computeThinkingBudget, formatThinkingBudgetDirective } from "./budget-scaler.js";
export function handleUserPromptSubmitHook(inputJson) {
    try {
        const parsed = JSON.parse(inputJson);
        const prompt = parsed.prompt || "";
        const decision = computeThinkingBudget(prompt);
        // Only inject directive for non-trivial standard/high/deep tasks
        if (decision.level === "off") {
            return JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: "UserPromptSubmit",
                    additionalContext: "",
                },
            });
        }
        const directive = formatThinkingBudgetDirective(decision);
        return JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: directive,
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
