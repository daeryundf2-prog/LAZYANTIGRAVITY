import { describe, expect, it } from "vitest";
import { validateResultEnvelope } from "../src/control-plane.ts";

describe("Subagent Result Envelope Validation", () => {
	it("validates valid envelopes", () => {
		const valid = {
			runId: "run-1",
			agentId: "agent-1",
			role: "worker",
			status: "success" as const,
			summary: "Implemented the requested function tests",
			filesChanged: ["src/a.ts"],
			commandsRun: [],
			artifactsGenerated: [],
			blockers: [],
			nextRecommendedAction: "None",
			requiresParentAck: true,
		};

		const res = validateResultEnvelope(valid, "run-1", "worker");
		expect(res.runId).toBe("run-1");
		expect(res.role).toBe("worker");
	});

	it("rejects runId mismatch", () => {
		const envelope = {
			runId: "run-wrong",
			agentId: "agent-1",
			role: "worker",
			status: "success" as const,
			summary: "Done",
			filesChanged: [],
			commandsRun: [],
			artifactsGenerated: [],
			blockers: [],
			nextRecommendedAction: "None",
			requiresParentAck: true,
		};

		expect(() => validateResultEnvelope(envelope, "run-1", "worker")).toThrow("Run ID mismatch");
	});

	it("rejects role mismatch", () => {
		const envelope = {
			runId: "run-1",
			agentId: "agent-1",
			role: "researcher",
			status: "success" as const,
			summary: "Done",
			filesChanged: [],
			commandsRun: [],
			artifactsGenerated: [],
			blockers: [],
			nextRecommendedAction: "None",
			requiresParentAck: true,
		};

		expect(() => validateResultEnvelope(envelope, "run-1", "worker")).toThrow("Role mismatch");
	});

	it("rejects requiresParentAck false", () => {
		const envelope = {
			runId: "run-1",
			agentId: "agent-1",
			role: "worker",
			status: "success" as const,
			summary: "Done",
			filesChanged: [],
			commandsRun: [],
			artifactsGenerated: [],
			blockers: [],
			nextRecommendedAction: "None",
			requiresParentAck: false,
		};

		expect(() => validateResultEnvelope(envelope, "run-1", "worker")).toThrow("requiresParentAck must be true");
	});

	it("rejects forbidden phrases indicating self-finalization", () => {
		const envelope = {
			runId: "run-1",
			agentId: "agent-1",
			role: "worker",
			status: "success" as const,
			summary: "I completed the whole task and closed it",
			filesChanged: [],
			commandsRun: [],
			artifactsGenerated: [],
			blockers: [],
			nextRecommendedAction: "None",
			requiresParentAck: true,
		};

		expect(() => validateResultEnvelope(envelope, "run-1", "worker")).toThrow("Forbidden phrase detected");
	});
});
