import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "../src/control-plane-types.js";
import { checkStagnation, DEFAULT_STAGNATION_POLICY } from "../src/stagnation-guard.js";

function createEvent(type: LedgerEvent["type"], result: unknown, reason?: string): LedgerEvent {
	return {
		timestamp: new Date().toISOString(),
		type,
		runId: "run-1",
		agentId: "agent-1",
		result,
		reason,
	};
}

describe("StagnationGuard", () => {
	it("should return ok for empty events", () => {
		const res = checkStagnation([], DEFAULT_STAGNATION_POLICY);
		expect(res.status).toBe("ok");
	});

	it("should detect same_error_loop", () => {
		const events: LedgerEvent[] = [];
		for (let i = 0; i < 3; i++) {
			events.push(createEvent("agent.progress", { error: "SyntaxError: Unexpected token", errorCode: 1 }));
		}
		const res = checkStagnation(events, DEFAULT_STAGNATION_POLICY);
		expect(res.status).toBe("same_error_loop");
	});

	it("should detect oscillation_detected (A/B/A/B)", () => {
		const events: LedgerEvent[] = [
			createEvent("agent.progress", { diff: "+ patch A" }),
			createEvent("agent.progress", { diff: "+ patch B" }),
			createEvent("agent.progress", { diff: "+ patch A" }),
			createEvent("agent.progress", { diff: "+ patch B" }),
		];
		const res = checkStagnation(events, DEFAULT_STAGNATION_POLICY);
		expect(res.status).toBe("oscillation_detected");
	});

	it("should detect heartbeat_only_stall", () => {
		const events: LedgerEvent[] = [];
		for (let i = 0; i < 5; i++) {
			events.push(createEvent("agent.heartbeat", undefined));
		}
		const res = checkStagnation(events, DEFAULT_STAGNATION_POLICY);
		expect(res.status).toBe("heartbeat_only_stall");
	});

	it("should detect no_evidence_progress", () => {
		const events: LedgerEvent[] = [];
		for (let i = 0; i < 5; i++) {
			// Progress without diff, filesChanged, or commandsRun
			events.push(createEvent("agent.progress", { summary: "Thinking..." }));
		}
		const res = checkStagnation(events, DEFAULT_STAGNATION_POLICY);
		expect(res.status).toBe("no_evidence_progress");
	});

	it("should return ok if progress has evidence", () => {
		const events: LedgerEvent[] = [];
		for (let i = 0; i < 5; i++) {
			events.push(createEvent("agent.progress", { summary: "Thinking...", commandsRun: ["ls"] }));
		}
		const res = checkStagnation(events, DEFAULT_STAGNATION_POLICY);
		expect(res.status).toBe("ok");
	});
});
