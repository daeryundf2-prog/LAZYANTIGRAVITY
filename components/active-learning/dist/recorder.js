import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function getFailureEventsPath(cwd = process.cwd()) {
    return join(cwd, ".lazyantigravity", "telemetry", "events.jsonl");
}
const MAX_MESSAGE_CHARS = 400;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ROTATION_KEEP_LINES = 500;
function sanitize(text, max = MAX_MESSAGE_CHARS) {
    return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function rotateIfNeeded(eventsPath) {
    try {
        if (statSync(eventsPath).size <= MAX_FILE_BYTES)
            return;
        const lines = readFileSync(eventsPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
        const kept = lines.slice(-ROTATION_KEEP_LINES);
        writeFileSync(eventsPath, `${kept.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
    }
    catch {
        // If rotation fails, keep appending; recording is best-effort.
    }
}
/**
 * Best-effort failure recording for the active-learning feedback loop.
 * Never throws: a telemetry failure must not break the failing caller.
 */
export function recordFailureEvent(input, cwd = process.cwd()) {
    try {
        const dir = join(cwd, ".lazyantigravity", "telemetry");
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const eventsPath = getFailureEventsPath(cwd);
        rotateIfNeeded(eventsPath);
        const record = {
            id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            eventType: sanitize(input.eventType || "tool_error", 80) || "tool_error",
            toolName: sanitize(input.toolName, 80) || "unknown",
            targetPath: sanitize(input.targetPath || "", 200),
            errorMessage: sanitize(input.errorMessage) || "Unknown error",
        };
        appendFileSync(eventsPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
        return true;
    }
    catch {
        return false;
    }
}
