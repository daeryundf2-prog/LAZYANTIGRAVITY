import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
export function readFailureEvents(cwd = process.cwd()) {
    const possiblePaths = [
        join(cwd, ".lazyantigravity", "telemetry", "events.jsonl"),
        join(cwd, ".lazyantigravity", "active-learning", "failures.jsonl"),
    ];
    const events = [];
    for (const p of possiblePaths) {
        if (existsSync(p)) {
            try {
                const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim().length > 0);
                for (const line of lines) {
                    try {
                        const ev = JSON.parse(line);
                        if (ev && (ev.eventType || ev.status === "error" || ev.error)) {
                            events.push({
                                id: ev.id || `ev-${Date.now()}`,
                                timestamp: ev.timestamp || Date.now(),
                                eventType: ev.eventType || "tool_error",
                                toolName: ev.toolName || ev.tool || "unknown",
                                targetPath: ev.targetPath || ev.file || "",
                                errorMessage: ev.errorMessage || ev.error || ev.message || "Unknown error",
                            });
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }
    }
    return events;
}
export function extractFailurePatterns(events) {
    const clusters = new Map();
    for (const ev of events) {
        // Clean error signature
        const key = `${ev.toolName || "general"}:${ev.errorMessage.slice(0, 60).replace(/[0-9]+/g, "#")}`;
        const existing = clusters.get(key) || { count: 0, sampleError: ev.errorMessage, toolName: ev.toolName || "general" };
        existing.count++;
        clusters.set(key, existing);
    }
    const gotchas = [];
    for (const [key, val] of clusters.entries()) {
        if (val.count >= 2) {
            const confidence = Math.min(0.5 + val.count * 0.15, 0.99);
            gotchas.push({
                id: `gotcha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                pattern: key,
                suggestedRule: `Caution: tool [${val.toolName}] failed ${val.count}x with '${val.sampleError.slice(0, 80)}'. Validate parameters up-front before retrying.`,
                confidence,
                occurrences: val.count,
            });
        }
    }
    return gotchas;
}
