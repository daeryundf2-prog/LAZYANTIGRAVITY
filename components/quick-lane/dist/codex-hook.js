import { isQuickLanePrompt } from "./classifier.js";
import { QUICK_LANE_DIRECTIVE } from "./directive.js";
export function runQuickLaneHook(input) {
    if (!isQuickLaneHookInput(input))
        return "";
    if (!isQuickLanePrompt(input.prompt))
        return "";
    const output = {
        hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: QUICK_LANE_DIRECTIVE,
        },
    };
    return `${JSON.stringify(output)}\n`;
}
function isQuickLaneHookInput(value) {
    return (typeof value === "object" &&
        value !== null &&
        value["hook_event_name"] ===
            "UserPromptSubmit" &&
        typeof value["prompt"] === "string");
}
