import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appendRunEvent, FORBIDDEN_PHRASES, getRunDir, loadLeasePolicy, safeSegment } from "./control-plane.js";
import type {
	LedgerEvent,
	PollerState,
	QualityEvidenceEnvelope,
	RunStateSchema,
	SubagentResultEnvelope,
} from "./control-plane-types.js";
import { reconstructStateFromEvents } from "./reconstruct.js";
import { stripSensitiveData } from "./sensitive-data-scrubber.js";

export function validateQualityEvidenceEnvelope(envelope: unknown): QualityEvidenceEnvelope {
	if (!envelope || typeof envelope !== "object") throw new Error("Invalid envelope: must be an object");
	const env = envelope as QualityEvidenceEnvelope;
	if (typeof env.goal !== "string" || typeof env.summary !== "string") throw new Error("Invalid goal or summary");
	if (!Array.isArray(env.filesChanged) || !Array.isArray(env.commandsRun) || !Array.isArray(env.testResults))
		throw new Error("Invalid array fields");
	if (
		!Array.isArray(env.artifactsGenerated) ||
		!Array.isArray(env.completedRoles) ||
		!Array.isArray(env.acknowledgedRoles)
	)
		throw new Error("Invalid role/artifact fields");
	if (typeof env.dryRunSafety !== "boolean") throw new Error("Missing dryRunSafety");
	for (const pattern of FORBIDDEN_PHRASES) {
		if (pattern.test(env.summary))
			throw new Error(`Forbidden phrase detected: "${env.summary}" matched ${pattern.toString()}`);
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
	if (!existsSync(runDir)) await mkdir(runDir, { recursive: true });
	await writeFile(join(runDir, "state.json"), JSON.stringify(stripSensitiveData(state), null, 2), "utf8");
	return poller;
}

export async function heartbeatAgent(repoRoot: string, runId: string, agentId: string): Promise<LedgerEvent> {
	const event = await appendRunEvent(repoRoot, runId, "agent.heartbeat", { agentId });
	const dir = join(getRunDir(repoRoot, runId), "heartbeats");
	if (!existsSync(dir)) await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, `${safeSegment(agentId)}.json`),
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
	await writeFile(join(runDir, "state.json"), JSON.stringify(stripSensitiveData(state), null, 2), "utf8");
	return state;
}
