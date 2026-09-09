import { readFileSync } from "node:fs";
import { ULTRAWORK_DIRECTIVE } from "./directive.js";
const ULTRAWORK_PATTERN = /\b(?:ultrawork|ulw)\b/i;
const ULTRAWORK_DIRECTIVE_MARKER = "<ultrawork-mode>";
const TRANSCRIPT_SEARCH_BYTES = 512_000;
const CONTEXT_PRESSURE_MARKERS = [
    "context compacted",
    "context_length_exceeded",
    "skill descriptions were shortened",
    "context_too_large",
    "codex ran out of room in the model's context window",
    "your input exceeds the context window",
    "long threads and multiple compactions",
];
export function runUserPromptSubmitHook(input) {
    if (!isCodexUserPromptSubmitInput(input))
        return "";
    if (isContextPressureRecoveryPrompt(input.prompt))
        return "";
    if (isContextPressureTranscript(input.transcript_path))
        return "";
    if (isExplicitCancellation(input.prompt))
        return "";
    const alreadyInTranscript = hasUltraworkDirectiveAlreadyInTranscript(input.transcript_path);
    if (isUltraworkPrompt(input.prompt)) {
        return alreadyInTranscript ? "" : formatAdditionalContextOutput(ULTRAWORK_DIRECTIVE);
    }
    if (alreadyInTranscript) {
        return formatAdditionalContextOutput('<ultrawork-mode active="true" follow-up="true"/>');
    }
    return "";
}
function isExplicitCancellation(prompt) {
    const lower = prompt.toLowerCase();
    return (lower.includes("cancel ulw") ||
        lower.includes("stop ulw") ||
        lower.includes("stop ultrawork") ||
        lower.includes("ulw 중단") ||
        lower.includes("ulw 취소"));
}
function hasUltraworkDirectiveAlreadyInTranscript(transcriptPath) {
    if (transcriptPath === undefined || transcriptPath === null)
        return false;
    try {
        const rawTranscript = readTranscriptTail(transcriptPath);
        for (const line of rawTranscript.split(/\r?\n/)) {
            const parsed = parseJsonLine(line);
            if (parsed === null) {
                continue;
            }
            if (!isRecord(parsed)) {
                continue;
            }
            const hookSpecificOutput = parsed["hookSpecificOutput"];
            if (!isRecord(hookSpecificOutput)) {
                continue;
            }
            if (hookSpecificOutput["hookEventName"] !== "UserPromptSubmit") {
                continue;
            }
            if (typeof hookSpecificOutput["additionalContext"] === "string" &&
                hookSpecificOutput["additionalContext"].includes(ULTRAWORK_DIRECTIVE_MARKER)) {
                return true;
            }
        }
    }
    catch (error) {
        if (error instanceof Error)
            return false;
        throw error;
    }
    return false;
}
function readTranscriptTail(transcriptPath) {
    const rawTranscript = readFileSync(transcriptPath);
    return rawTranscript.subarray(Math.max(0, rawTranscript.byteLength - TRANSCRIPT_SEARCH_BYTES)).toString("utf8");
}
export function isUltraworkPrompt(prompt) {
    return ULTRAWORK_PATTERN.test(prompt);
}
function isContextPressureRecoveryPrompt(prompt) {
    const normalizedPrompt = prompt.toLowerCase();
    return CONTEXT_PRESSURE_MARKERS.some((marker) => normalizedPrompt.includes(marker));
}
function isContextPressureTranscript(transcriptPath) {
    if (transcriptPath === undefined || transcriptPath === null)
        return false;
    try {
        return isContextPressureRecoveryPrompt(readFileSync(transcriptPath, "utf8"));
    }
    catch (error) {
        if (error instanceof Error)
            return false;
        throw error;
    }
}
function formatAdditionalContextOutput(additionalContext) {
    const normalizedContext = normalizeAdditionalContext(additionalContext);
    if (normalizedContext.length === 0)
        return "";
    const output = {
        hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: normalizedContext,
        },
    };
    return `${JSON.stringify(output)}\n`;
}
function normalizeAdditionalContext(additionalContext) {
    return additionalContext.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}
function parseJsonLine(line) {
    if (line.trim().length === 0) {
        return null;
    }
    try {
        const parsed = JSON.parse(line);
        return parsed;
    }
    catch (error) {
        if (error instanceof Error) {
            return null;
        }
        throw error;
    }
}
function isCodexUserPromptSubmitInput(value) {
    return (isRecord(value) &&
        value["hook_event_name"] === "UserPromptSubmit" &&
        typeof value["prompt"] === "string" &&
        (value["transcript_path"] === undefined ||
            value["transcript_path"] === null ||
            typeof value["transcript_path"] === "string"));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
