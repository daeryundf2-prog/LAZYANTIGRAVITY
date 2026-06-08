import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
	AgentState,
	AssignmentState,
	EventType,
	LeasePolicy,
	LedgerEvent,
	PollerState,
	RunState,
	RunStateSchema,
	SubagentResultEnvelope,
} from "./control-plane-types.js";

export type {
	AgentState,
	AssignmentState,
	EventType,
	LeasePolicy,
	LedgerEvent,
	PollerState,
	RunState,
	RunStateSchema,
	SubagentResultEnvelope,
};

const DEFAULT_POLICY: LeasePolicy = {
	subagentLease: {
		defaultLeaseMs: 30000,
		maxLeaseMs: 120000,
		heartbeatIntervalMs: 10000,
		staleGraceMs: 5000,
		maxMissedHeartbeats: 3,
	},
	pollingGuard: {
		pollerLeaseMs: 10000,
	},
};

const FORBIDDEN_PHRASES = [
	/completed the whole task/i,
	/completed the entire task/i,
	/finished the entire \/ulw/i,
	/finished the whole \/ulw/i,
	/run completed/i,
	/task completed/i,
	/ulw task is complete/i,
	/finalize run/i,
	/mark run as completed/i,
	/completed the global task/i,
];

// Helper to get run directory
export function getRunDir(repoRoot: string, runId: string): string {
	return join(repoRoot, ".lazycodex", "runs", runId);
}

// Load lease policy
export async function loadLeasePolicy(repoRoot: string): Promise<LeasePolicy> {
	const policyPath = join(repoRoot, "plugins", "omo", "components", "ulw-loop", "src", "lease-policy.json");
	if (existsSync(policyPath)) {
		try {
			const content = await readFile(policyPath, "utf8");
			return JSON.parse(content) as LeasePolicy;
		} catch {
			return DEFAULT_POLICY;
		}
	}
	return DEFAULT_POLICY;
}

// Append event to ledger
export async function appendRunEvent(
	repoRoot: string,
	runId: string,
	type: EventType,
	data: Omit<LedgerEvent, "timestamp" | "type" | "runId">,
): Promise<LedgerEvent> {
	const runDir = getRunDir(repoRoot, runId);
	if (!existsSync(runDir)) {
		await mkdir(runDir, { recursive: true });
	}

	const event: LedgerEvent = {
		timestamp: new Date().toISOString(),
		type,
		runId,
		...data,
	};

	const eventsFile = join(runDir, "events.jsonl");
	await writeFile(eventsFile, `${JSON.stringify(event)}\n`, { flag: "a", encoding: "utf8" });

	// Reconstruct state and save it
	await reconstructAndSaveState(repoRoot, runId);

	// Also save agent file if agentId is present
	if (event.agentId) {
		const agentsDir = join(runDir, "agents");
		if (!existsSync(agentsDir)) {
			await mkdir(agentsDir, { recursive: true });
		}
		const agentState = await getAgentState(repoRoot, runId, event.agentId);
		if (agentState) {
			await writeFile(join(agentsDir, `${event.agentId}.json`), JSON.stringify(agentState, null, 2), "utf8");
		}
	}

	return event;
}

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

// Get agent state
export async function getAgentState(repoRoot: string, runId: string, agentId: string): Promise<AgentState | null> {
	const state = await reconstructStateFromEvents(repoRoot, runId);
	return state.agents[agentId] || null;
}

// Polling Guard: register poller
export async function registerPoller(
	repoRoot: string,
	runId: string,
	pollerId: string,
	nowOverride?: Date,
): Promise<PollerState> {
	const now = nowOverride || new Date();
	const state = await reconstructStateFromEvents(repoRoot, runId, now);

	if (state.activePoller && state.activePoller.pollerId !== pollerId) {
		const expires = new Date(state.activePoller.expiresAt);
		if (now < expires) {
			throw new Error(
				`Double poller registration blocked: Run ${runId} has active poller ${state.activePoller.pollerId} expiring at ${state.activePoller.expiresAt}`,
			);
		}
	}

	const policy = await loadLeasePolicy(repoRoot);
	const expiresAt = new Date(now.getTime() + policy.pollingGuard.pollerLeaseMs).toISOString();
	const poller: PollerState = { pollerId, expiresAt };

	state.activePoller = poller;

	const runDir = getRunDir(repoRoot, runId);
	if (!existsSync(runDir)) {
		await mkdir(runDir, { recursive: true });
	}
	await writeFile(join(runDir, "state.json"), JSON.stringify(state, null, 2), "utf8");

	return poller;
}

export async function heartbeatAgent(repoRoot: string, runId: string, agentId: string): Promise<LedgerEvent> {
	const event = await appendRunEvent(repoRoot, runId, "agent.heartbeat", { agentId });
	const runDir = getRunDir(repoRoot, runId);
	const heartbeatsDir = join(runDir, "heartbeats");
	if (!existsSync(heartbeatsDir)) await mkdir(heartbeatsDir, { recursive: true });
	await writeFile(
		join(heartbeatsDir, `${agentId}.json`),
		JSON.stringify({ agentId, timestamp: event.timestamp }, null, 2),
		"utf8",
	);
	return event;
}

export async function checkLeases(repoRoot: string, runId: string, nowOverride?: Date): Promise<RunStateSchema> {
	const now = nowOverride || new Date();
	const state = await reconstructStateFromEvents(repoRoot, runId, now);
	const runDir = getRunDir(repoRoot, runId);
	if (!existsSync(runDir)) await mkdir(runDir, { recursive: true });
	await writeFile(join(runDir, "state.json"), JSON.stringify(state, null, 2), "utf8");
	return state;
}

export function validateResultEnvelope(
	envelope: unknown,
	expectedRunId: string,
	expectedRole: string,
): SubagentResultEnvelope {
	if (!envelope || typeof envelope !== "object") throw new Error("Invalid envelope: must be an object");
	const env = envelope as SubagentResultEnvelope;
	if (env.runId !== expectedRunId) throw new Error(`Run ID mismatch: expected ${expectedRunId}, got ${env.runId}`);
	if (env.role !== expectedRole) throw new Error(`Role mismatch: expected ${expectedRole}, got ${env.role}`);
	if (env.requiresParentAck === false) throw new Error("Validation rejected: requiresParentAck must be true");

	const texts = [env.summary || "", env.nextRecommendedAction || ""];
	for (const text of texts) {
		for (const pattern of FORBIDDEN_PHRASES) {
			if (pattern.test(text)) throw new Error(`Forbidden phrase detected: "${text}" matched ${pattern.toString()}`);
		}
	}
	return env;
}
