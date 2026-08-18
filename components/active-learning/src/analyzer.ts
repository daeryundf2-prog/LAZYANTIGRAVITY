import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LearnedGotcha, TelemetryFailureEvent } from "./types.js";

export function readFailureEvents(cwd: string = process.cwd()): TelemetryFailureEvent[] {
	const possiblePaths = [
		join(cwd, ".lazyantigravity", "telemetry", "events.jsonl"),
		join(cwd, ".lazyantigravity", "active-learning", "failures.jsonl"),
	];

	const events: TelemetryFailureEvent[] = [];

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
					} catch {}
				}
			} catch {}
		}
	}

	return events;
}

export function extractFailurePatterns(events: TelemetryFailureEvent[]): LearnedGotcha[] {
	const clusters = new Map<string, { count: number; sampleError: string; toolName: string }>();

	for (const ev of events) {
		// Clean error signature
		const key = `${ev.toolName || "general"}:${ev.errorMessage.slice(0, 60).replace(/[0-9]+/g, "#")}`;
		const existing = clusters.get(key) || { count: 0, sampleError: ev.errorMessage, toolName: ev.toolName || "general" };
		existing.count++;
		clusters.set(key, existing);
	}

	const gotchas: LearnedGotcha[] = [];

	for (const [key, val] of clusters.entries()) {
		if (val.count >= 2) {
			const confidence = Math.min(0.5 + val.count * 0.15, 0.99);
			gotchas.push({
				id: `gotcha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
				pattern: key,
				suggestedRule: `주의: [${val.toolName}] 도구 사용 시 '${val.sampleError.slice(0, 80)}' 오류가 ${val.count}회 반복 발생함. 사전 매개변수 유효성 검사 필수.`,
				confidence,
				occurrences: val.count,
			});
		}
	}

	return gotchas;
}
