import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
const BASH_TOOL_NAME = "Bash";
const REMINDER = "On Windows, prefer the OMO git_bash MCP for shell commands before using built-in exec_command. Use exec_command only when git_bash is unavailable or for non-shell operations.";
export function parsePreToolUsePayload(raw) {
    if (raw.trim().length === 0)
        return null;
    try {
        const parsed = JSON.parse(raw);
        const normalized = normalizeAntigravityHookPayload(parsed);
        return isPreToolUsePayload(normalized) ? normalized : null;
    }
    catch (error) {
        if (error instanceof SyntaxError)
            return null;
        return null;
    }
}
export function parsePostCompactPayload(raw) {
    if (raw.trim().length === 0)
        return null;
    try {
        const parsed = JSON.parse(raw);
        return isPostCompactPayload(parsed) ? parsed : null;
    }
    catch (error) {
        if (error instanceof SyntaxError)
            return null;
        return null;
    }
}
export function applyGitBashPreToolUseReminder(payload, options = {}) {
    if (payload.hook_event_name !== "PreToolUse")
        return "";
    if (payload.tool_name !== BASH_TOOL_NAME)
        return "";
    if (!isWindowsHost(options))
        return "";
    const markerPath = reminderMarkerPath(payload.session_id, options.pluginDataRoot);
    if (hasReminderMarker(markerPath))
        return "";
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, `${new Date().toISOString()}\n`);
    const output = {
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            additionalContext: REMINDER,
        },
    };
    return `${JSON.stringify(output)}\n`;
}
export function applyGitBashPostCompactReset(payload, options = {}) {
    if (payload.hook_event_name !== "PostCompact")
        return "";
    rmSync(reminderMarkerPath(payload.session_id, options.pluginDataRoot), { force: true });
    return "";
}
export async function runGitBashHookCli(stdin, stdout, eventName = "pre-tool-use", options = {}) {
    try {
        const raw = await readAll(stdin);
        const output = eventName === "post-compact" ? postCompactOutput(raw, options) : preToolUseOutput(raw, options);
        if (output.length > 0)
            stdout.write(output);
    }
    catch (error) {
        if (error instanceof Error)
            return;
        return;
    }
}
function preToolUseOutput(raw, options) {
    const payload = parsePreToolUsePayload(raw);
    if (payload === null)
        return "";
    return applyGitBashPreToolUseReminder(payload, options);
}
function postCompactOutput(raw, options) {
    const payload = parsePostCompactPayload(raw);
    if (payload === null)
        return "";
    return applyGitBashPostCompactReset(payload, options);
}
function isWindowsHost(options) {
    const platform = options.platform ?? process.platform;
    if (platform === "win32")
        return true;
    const env = options.env ?? process.env;
    return env["OS"] === "Windows_NT" || env["ComSpec"] !== undefined || env["SystemRoot"] !== undefined;
}
function hasReminderMarker(path) {
    return existsSync(path);
}
function reminderMarkerPath(sessionId, pluginDataRoot) {
    const root = pluginDataRoot
        ?? process.env["PLUGIN_DATA"]
        ?? (process.env["GEMINI_HOME"] || process.env["ANTIGRAVITY_HOME"]
            ? join(process.env["GEMINI_HOME"] || process.env["ANTIGRAVITY_HOME"] || "", "data", "omo-git-bash")
            : join(homedir(), ".codex", "omo-git-bash"));
    return join(root, "git-bash-reminder", `${safePathSegment(sessionId)}.seen`);
}
function safePathSegment(value) {
    return value.replace(/[^A-Za-z0-9._-]/g, "_");
}
function normalizeAntigravityHookPayload(value) {
    if (!isRecord(value))
        return value;
    const input = value;
    const tool = isRecord(input["tool"] ?? input["toolCall"] ?? input["tool_call"]) ? (input["tool"] ?? input["toolCall"] ?? input["tool_call"]) : undefined;
    const normalizedEvent = String(input["hook_event_name"] ?? input["eventName"] ?? input["event_type"] ?? "").replace(/[\s-]/g, "").toLowerCase();
    const event = normalizedEvent === "pretooluse" || normalizedEvent === "pretool" ? "PreToolUse" : input["hook_event_name"];
    return {
        ...input,
        hook_event_name: event,
        cwd: input["cwd"] ?? input["workspaceRoot"] ?? input["workspace_root"],
        model: typeof input["model"] === "string" ? input["model"] : isRecord(input["model"]) ? input["model"]["modelId"] ?? input["model"]["model_id"] : input["model"],
        permission_mode: input["permission_mode"] ?? input["permissionMode"] ?? "default",
        session_id: input["session_id"] ?? input["sessionId"],
        tool_name: input["tool_name"] ?? input["toolName"] ?? tool?.["name"],
        tool_use_id: input["tool_use_id"] ?? input["toolUseId"] ?? tool?.["id"],
        tool_input: input["tool_input"] ?? input["toolInput"] ?? tool?.["args"] ?? tool?.["arguments"],
        transcript_path: input["transcript_path"] ?? input["transcriptPath"] ?? null,
        turn_id: input["turn_id"] ?? input["turnId"] ?? input["requestId"] ?? input["request_id"],
    };
}
function isPreToolUsePayload(value) {
    if (!isRecord(value))
        return false;
    return (value["hook_event_name"] === "PreToolUse" &&
        typeof value["cwd"] === "string" &&
        typeof value["model"] === "string" &&
        typeof value["permission_mode"] === "string" &&
        typeof value["session_id"] === "string" &&
        typeof value["tool_name"] === "string" &&
        typeof value["tool_use_id"] === "string" &&
        (value["transcript_path"] === null || typeof value["transcript_path"] === "string") &&
        typeof value["turn_id"] === "string" &&
        Object.hasOwn(value, "tool_input"));
}
function isPostCompactPayload(value) {
    if (!isRecord(value))
        return false;
    return (value["hook_event_name"] === "PostCompact" &&
        typeof value["session_id"] === "string" &&
        (value["transcript_path"] === undefined ||
            value["transcript_path"] === null ||
            typeof value["transcript_path"] === "string") &&
        (value["trigger"] === undefined || typeof value["trigger"] === "string"));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readAll(stdin) {
    return new Promise((resolve, reject) => {
        let data = "";
        stdin.setEncoding("utf8");
        stdin.on("data", (chunk) => {
            data += chunk instanceof Buffer ? chunk.toString() : String(chunk);
        });
        stdin.once("error", reject);
        stdin.once("end", () => resolve(data));
    });
}
