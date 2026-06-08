import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRunEvents, reconstructAndSaveState, reconstructStateFromEvents } from "./reconstruct.js";

export { readRunEvents, reconstructAndSaveState, reconstructStateFromEvents };

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
	QualityEvidenceEnvelope,
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

export function validateQualityEvidenceEnvelope(
	envelope: unknown,
): QualityEvidenceEnvelope {
	if (!envelope || typeof envelope !== "object") throw new Error("Invalid envelope: must be an object");
	const env = envelope as QualityEvidenceEnvelope;
	
	if (typeof env.goal !== "string") throw new Error("Missing or invalid 'goal'");
	if (typeof env.summary !== "string") throw new Error("Missing or invalid 'summary'");
	if (!Array.isArray(env.filesChanged)) throw new Error("Missing or invalid 'filesChanged'");
	if (!Array.isArray(env.commandsRun)) throw new Error("Missing or invalid 'commandsRun'");
	if (!Array.isArray(env.testResults)) throw new Error("Missing or invalid 'testResults'");
	if (!Array.isArray(env.artifactsGenerated)) throw new Error("Missing or invalid 'artifactsGenerated'");
	if (!Array.isArray(env.completedRoles)) throw new Error("Missing or invalid 'completedRoles'");
	if (!Array.isArray(env.acknowledgedRoles)) throw new Error("Missing or invalid 'acknowledgedRoles'");
	if (typeof env.dryRunSafety !== "boolean") throw new Error("Missing or invalid 'dryRunSafety'");

	const texts = [env.summary];
	for (const text of texts) {
		for (const pattern of FORBIDDEN_PHRASES) {
			if (pattern.test(text)) throw new Error(`Forbidden phrase detected: "${text}" matched ${pattern.toString()}`);
		}
	}
	return env;
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
