import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRunEvent, getRunDir, reconstructStateFromEvents } from "../src/control-plane.ts";

const testDir = join(fileURLToPath(new URL(".", import.meta.url)), "test-control-plane-temp");

beforeEach(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

afterEach(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

describe("Subagent Control Plane & Event Ledger", () => {
	it("initializes run and appends events", async () => {
		const runId = "run-test-1";
		const runDir = getRunDir(testDir, runId);

		await appendRunEvent(testDir, runId, "run.created", {});
		expect(existsSync(join(runDir, "events.jsonl"))).toBe(true);
		expect(existsSync(join(runDir, "state.json"))).toBe(true);

		await appendRunEvent(testDir, runId, "run.state_changed", { state: "working" });
		await appendRunEvent(testDir, runId, "agent.dispatched", { agentId: "agent-1", role: "worker" });
		await appendRunEvent(testDir, runId, "agent.claimed", { agentId: "agent-1" });

		const state = await reconstructStateFromEvents(testDir, runId);
		expect(state.runId).toBe(runId);
		expect(state.state).toBe("working");
		expect(state.agents["agent-1"]).toBeDefined();
		expect(state.agents["agent-1"]?.state).toBe("claimed");
		expect(state.agents["agent-1"]?.role).toBe("worker");
	});

	it("reconstructs agent state transitions correctly", async () => {
		const runId = "run-test-2";

		await appendRunEvent(testDir, runId, "run.created", {});
		await appendRunEvent(testDir, runId, "agent.dispatched", { agentId: "agent-1", role: "researcher" });
		await appendRunEvent(testDir, runId, "agent.claimed", { agentId: "agent-1" });
		await appendRunEvent(testDir, runId, "agent.heartbeat", { agentId: "agent-1" });
		await appendRunEvent(testDir, runId, "agent.progress", { agentId: "agent-1", progress: "working on Y" });

		let state = await reconstructStateFromEvents(testDir, runId);
		expect(state.agents["agent-1"]?.state).toBe("running");
		expect(state.agents["agent-1"]?.lastProgress).toBe("working on Y");

		await appendRunEvent(testDir, runId, "agent.completed_reported", { agentId: "agent-1", result: { ok: true } });
		state = await reconstructStateFromEvents(testDir, runId);
		expect(state.agents["agent-1"]?.state).toBe("completed_reported");

		await appendRunEvent(testDir, runId, "parent.acknowledged", { agentId: "agent-1" });
		state = await reconstructStateFromEvents(testDir, runId);
		expect(state.agents["agent-1"]?.state).toBe("acknowledged");
	});
});
