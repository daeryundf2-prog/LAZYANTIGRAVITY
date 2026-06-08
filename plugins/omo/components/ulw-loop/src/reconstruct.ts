import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getRunDir, loadLeasePolicy } from "./control-plane.js";
import type { LedgerEvent, RunState, RunStateSchema } from "./control-plane-types.js";

// Read events
export async function readRunEvents(repoRoot: string, runId: string): Promise<LedgerEvent[]> {
	const runDir = getRunDir(repoRoot, runId);
	const eventsFile = join(runDir, "events.jsonl");
	if (!existsSync(eventsFile)) {
		return [];
	}

	const content = await readFile(eventsFile, "utf8");
	return content
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as LedgerEvent);
}

// Reconstruct state from events
export async function reconstructStateFromEvents(
	repoRoot: string,
	runId: string,
	nowOverride?: Date,
): Promise<RunStateSchema> {
	const events = await readRunEvents(repoRoot, runId);
	const policy = await loadLeasePolicy(repoRoot);
	const subConfig = policy.subagentLease;

	const runState: RunStateSchema = {
		runId,
		state: "created",
		updatedAt: new Date().toISOString(),
		agents: {},
	};

	const now = nowOverride || new Date();

	for (const event of events) {
		const eventTime = new Date(event.timestamp);

		if (event.type === "run.created") runState.state = "created";
		else if (event.type === "run.state_changed") runState.state = event.state as RunState;
		else if (event.type === "parent.paused") runState.state = "paused";
		else if (event.type === "parent.resumed") runState.state = (event.state as RunState) || "working";
		else if (event.type === "run.completed") runState.state = "completed";
		else if (event.type === "run.failed") runState.state = "failed";

		if (event.agentId) {
			const agentId = event.agentId;
			if (!runState.agents[agentId]) {
				runState.agents[agentId] = {
					agentId,
					role: event.role || "",
					state: "pending",
					dispatchedAt: event.timestamp,
					leaseExpiresAt: new Date(eventTime.getTime() + subConfig.defaultLeaseMs).toISOString(),
				};
			}

			const agent = runState.agents[agentId];

			if (event.type === "agent.dispatched") {
				agent.state = "dispatched";
				agent.role = event.role || agent.role;
				agent.dispatchedAt = event.timestamp;
				agent.leaseExpiresAt = new Date(eventTime.getTime() + subConfig.defaultLeaseMs).toISOString();
			} else if (event.type === "agent.claimed") {
				agent.state = "claimed";
				agent.claimedAt = event.timestamp;
				agent.leaseExpiresAt = new Date(eventTime.getTime() + subConfig.defaultLeaseMs).toISOString();
			} else if (event.type === "agent.heartbeat") {
				if (["dispatched", "claimed", "running", "stale_candidate"].includes(agent.state)) agent.state = "running";
				agent.lastHeartbeat = event.timestamp;
				const nextLease = Math.min(
					eventTime.getTime() + subConfig.defaultLeaseMs,
					new Date(agent.dispatchedAt).getTime() + subConfig.maxLeaseMs,
				);
				agent.leaseExpiresAt = new Date(nextLease).toISOString();
			} else if (event.type === "agent.progress") {
				if (["dispatched", "claimed", "running", "stale_candidate"].includes(agent.state)) agent.state = "running";
				if (event.progress !== undefined) agent.lastProgress = event.progress;
				agent.lastProgressAt = event.timestamp;
				const nextLease = Math.min(
					eventTime.getTime() + subConfig.defaultLeaseMs + subConfig.staleGraceMs,
					new Date(agent.dispatchedAt).getTime() + subConfig.maxLeaseMs,
				);
				agent.leaseExpiresAt = new Date(nextLease).toISOString();
			} else if (event.type === "agent.completed_reported") {
				agent.state = "completed_reported";
				agent.result = event.result;
			} else if (event.type === "agent.failed_reported") {
				agent.state = "failed_reported";
				agent.result = event.result;
			} else if (event.type === "parent.acknowledged") {
				agent.state = "acknowledged";
			} else if (event.type === "parent.rejected") {
				agent.state = "orphaned";
			}
		}
	}

	// Post-processing: check for stale candidates based on lease expiration
	for (const agentId of Object.keys(runState.agents)) {
		const agent = runState.agents[agentId];
		if (!agent) continue;
		const isTerminal = ["completed_reported", "failed_reported", "acknowledged", "orphaned"].includes(agent.state);
		if (!isTerminal && now > new Date(agent.leaseExpiresAt)) {
			agent.state = "stale_candidate";
		}
	}

	// Restore active poller lease from state.json if it exists
	const runDir = getRunDir(repoRoot, runId);
	const stateFile = join(runDir, "state.json");
	if (existsSync(stateFile)) {
		try {
			const savedState = JSON.parse(await readFile(stateFile, "utf8")) as RunStateSchema;
			if (savedState.activePoller && now < new Date(savedState.activePoller.expiresAt)) {
				runState.activePoller = savedState.activePoller;
			}
		} catch {}
	}

	runState.updatedAt = now.toISOString();
	return runState;
}

// Reconstruct and save state.json
export async function reconstructAndSaveState(repoRoot: string, runId: string): Promise<RunStateSchema> {
	const state = await reconstructStateFromEvents(repoRoot, runId);
	const runDir = getRunDir(repoRoot, runId);
	if (!existsSync(runDir)) {
		await mkdir(runDir, { recursive: true });
	}
	await writeFile(join(runDir, "state.json"), JSON.stringify(state, null, 2), "utf8");
	return state;
}
