import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRunEvent, checkLeases, heartbeatAgent, reconstructStateFromEvents } from "../src/control-plane.ts";

const testDir = join(fileURLToPath(new URL(".", import.meta.url)), "test-heartbeat-temp");

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

describe("Heartbeat and Lease Stale Candidate Logic", () => {
	it("extends lease on heartbeat and progress", async () => {
		const runId = "lease-test-1";

		await appendRunEvent(testDir, runId, "run.created", {});
		await appendRunEvent(testDir, runId, "agent.dispatched", { agentId: "agent-1", role: "worker" });

		let state = await reconstructStateFromEvents(testDir, runId);
		const initialExpiry = new Date(state.agents["agent-1"]?.leaseExpiresAt || "").getTime();

		// Heartbeat
		await heartbeatAgent(testDir, runId, "agent-1");
		state = await reconstructStateFromEvents(testDir, runId);
		const heartbeatExpiry = new Date(state.agents["agent-1"]?.leaseExpiresAt || "").getTime();
		expect(heartbeatExpiry).toBeGreaterThanOrEqual(initialExpiry);

		// Progress
		await appendRunEvent(testDir, runId, "agent.progress", { agentId: "agent-1", progress: "still going" });
		state = await reconstructStateFromEvents(testDir, runId);
		const progressExpiry = new Date(state.agents["agent-1"]?.leaseExpiresAt || "").getTime();
		expect(progressExpiry).toBeGreaterThanOrEqual(heartbeatExpiry);
	});

	it("transitions to stale_candidate on lease expiry", async () => {
		const runId = "lease-test-2";

		await appendRunEvent(testDir, runId, "run.created", {});
		await appendRunEvent(testDir, runId, "agent.dispatched", { agentId: "agent-1", role: "worker" });
		await appendRunEvent(testDir, runId, "agent.claimed", { agentId: "agent-1" });

		// Check leases in future
		const futureTime = new Date(Date.now() + 150000); // 150 seconds later (> 120s max lease limit)
		const state = await checkLeases(testDir, runId, futureTime);

		expect(state.agents["agent-1"]?.state).toBe("stale_candidate");
		expect(state.state).not.toBe("failed"); // Still "created", not failed!
	});
});
