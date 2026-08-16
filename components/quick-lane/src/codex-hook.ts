import { isQuickLanePrompt } from "./classifier.js";
import { QUICK_LANE_DIRECTIVE } from "./directive.js";

export type QuickLaneHookInput = {
	readonly hook_event_name: "UserPromptSubmit";
	readonly prompt: string;
	readonly transcript_path?: string | null;
};

interface UserPromptSubmitHookOutput {
	readonly hookSpecificOutput: {
		readonly hookEventName: "UserPromptSubmit";
		readonly additionalContext: string;
	};
}

export function runQuickLaneHook(input: unknown): string {
	if (!isQuickLaneHookInput(input)) return "";
	if (!isQuickLanePrompt(input.prompt)) return "";

	const output: UserPromptSubmitHookOutput = {
		hookSpecificOutput: {
			hookEventName: "UserPromptSubmit",
			additionalContext: QUICK_LANE_DIRECTIVE,
		},
	};
	return `${JSON.stringify(output)}\n`;
}

function isQuickLaneHookInput(value: unknown): value is QuickLaneHookInput {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Record<string, unknown>)["hook_event_name"] ===
			"UserPromptSubmit" &&
		typeof (value as Record<string, unknown>)["prompt"] === "string"
	);
}
