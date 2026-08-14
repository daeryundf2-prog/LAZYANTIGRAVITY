import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRunEvent, reconstructStateFromEvents } from "../src/control-plane.ts";

const testDir = join(fileURLToPath(new URL(".", import.meta.url)), "test-state-machine-temp");

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

describe("Role State Machine Logic", () => {
	it("parent ack rule", async () => {
		const runId = "sm-test-1";

		await appendRunEvent(testDir, runId, "run.created", {});
		await appendRunEvent(testDir, runId, "agent.dispatched", { agentId: "agent-1", role: "worker" });
		await appendRunEvent(testDir, runId, "agent.claimed", { agentId: "agent-1" });
		await appendRunEvent(testDir, runId, "agent.completed_reported", { agentId: "agent-1", result: { ok: true } });

		let state = await reconstructStateFromEvents(testDir, runId);
		expect(state.state).toBe("created"); // Run state not completed
		expect(state.agents["agent-1"]?.state).toBe("completed_reported"); // Subagent reports complete but run is not done

		// Parent rejects
		await appendRunEvent(testDir, runId, "parent.rejected", { agentId: "agent-1" });
		state = await reconstructStateFromEvents(testDir, runId);
		expect(state.agents["agent-1"]?.state).toBe("orphaned"); // Rejected becomes orphaned/rejected state

		// Re-dispatch
		await appendRunEvent(testDir, runId, "agent.dispatched", { agentId: "agent-1", role: "worker" });
		state = await reconstructStateFromEvents(testDir, runId);
		expect(state.agents["agent-1"]?.state).toBe("dispatched");

		// Claim, complete and parent ack
		await appendRunEvent(testDir, runId, "agent.claimed", { agentId: "agent-1" });
		await appendRunEvent(testDir, runId, "agent.completed_reported", { agentId: "agent-1", result: { ok: true } });
		await appendRunEvent(testDir, runId, "parent.acknowledged", { agentId: "agent-1" });

		state = await reconstructStateFromEvents(testDir, runId);
		expect(state.agents["agent-1"]?.state).toBe("acknowledged");

		// Run state is complete only when parent issues run.completed
		expect(state.state).not.toBe("completed");
		await appendRunEvent(testDir, runId, "run.completed", {});
		state = await reconstructStateFromEvents(testDir, runId);
		expect(state.state).toBe("completed");
	});
});
