import {
	appendRunEvent,
	checkLeases,
	getRunDir,
	reconstructStateFromEvents,
	registerPoller,
	validateResultEnvelope,
} from "./control-plane.js";
import { cleanupRunDir, out } from "./dry-run-helpers.js";
import type { DryRunContext } from "./dry-run-types.js";

export async function dispatchAgentScenario(scenario: string, ctx: DryRunContext): Promise<boolean> {
	if (scenario === "subagent-self-finalizes") {
		await subagentSelfFinalizes(ctx);
		return true;
	}
	if (scenario === "stale-heartbeat-missed") {
		await staleHeartbeatMissed(ctx);
		return true;
	}
	if (scenario === "polling-loop-prevented") {
		await pollingLoopPrevented(ctx);
		return true;
	}
	if (scenario === "parent-progress-reconstruct") {
		await parentProgressReconstruct(ctx);
		return true;
	}
	if (scenario === "subagent-wrong-role-envelope") {
		await subagentWrongRoleEnvelope(ctx);
		return true;
	}
	return false;
}

async function subagentSelfFinalizes(ctx: DryRunContext): Promise<void> {
	const runId = `dry-run-self-finalizes-${Date.now()}`;
	const runDir = getRunDir(ctx.repoRoot, runId);
	try {
		out(ctx.json, `Initializing subagent-self-finalizes scenario...`);
		await appendRunEvent(ctx.repoRoot, runId, "run.created", {});
		await appendRunEvent(ctx.repoRoot, runId, "run.state_changed", { state: "working" });
		await appendRunEvent(ctx.repoRoot, runId, "agent.dispatched", { agentId: "worker-1", role: "worker" });
		await appendRunEvent(ctx.repoRoot, runId, "agent.claimed", { agentId: "worker-1" });

		const badResult = {
			runId,
			agentId: "worker-1",
			role: "worker",
			status: "success",
			summary: "I completed the whole task successfully",
			filesChanged: ["src/index.ts"],
			commandsRun: [],
			artifactsGenerated: [],
			blockers: [],
			nextRecommendedAction: "None",
			requiresParentAck: true,
		};

		out(ctx.json, `Subagent worker-1 reports completion with self-finalizing phrase.`);

		try {
			validateResultEnvelope(badResult, runId, "worker");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			out(ctx.json, `Parent rejected result envelope: ${msg}`);
			await appendRunEvent(ctx.repoRoot, runId, "parent.rejected", { agentId: "worker-1", reason: msg });
		}

		const reconstructed = await reconstructStateFromEvents(ctx.repoRoot, runId);
		out(ctx.json, `Reconstructed agent state: ${reconstructed.agents["worker-1"]?.state}`);
	} finally {
		cleanupRunDir(ctx.writeCheckpoint, ctx.writeLedger, runDir);
	}
}

async function staleHeartbeatMissed(ctx: DryRunContext): Promise<void> {
	const runId = `dry-run-stale-${Date.now()}`;
	const runDir = getRunDir(ctx.repoRoot, runId);
	try {
		out(ctx.json, `Initializing stale-heartbeat-missed scenario...`);
		await appendRunEvent(ctx.repoRoot, runId, "run.created", {});
		await appendRunEvent(ctx.repoRoot, runId, "run.state_changed", { state: "working" });
		await appendRunEvent(ctx.repoRoot, runId, "agent.dispatched", { agentId: "worker-stale", role: "worker" });
		await appendRunEvent(ctx.repoRoot, runId, "agent.claimed", { agentId: "worker-stale" });

		const futureTime = new Date(Date.now() + 150000);
		const leaseState = await checkLeases(ctx.repoRoot, runId, futureTime);
		if (!ctx.json) {
			process.stdout.write(`[Dry-Run] Checking leases at future time: ${futureTime.toISOString()}\n`);
			process.stdout.write(
				`[Dry-Run] Agent worker-stale assignment state: ${leaseState.agents["worker-stale"]?.state}\n`,
			);
		}
	} finally {
		cleanupRunDir(ctx.writeCheckpoint, ctx.writeLedger, runDir);
	}
}

async function pollingLoopPrevented(ctx: DryRunContext): Promise<void> {
	const runId = `dry-run-polling-${Date.now()}`;
	const runDir = getRunDir(ctx.repoRoot, runId);
	try {
		out(ctx.json, `Initializing polling-loop-prevented scenario...`);
		await appendRunEvent(ctx.repoRoot, runId, "run.created", {});
		await registerPoller(ctx.repoRoot, runId, "poller-1");
		out(ctx.json, `Registered poller-1 successfully.`);

		try {
			await registerPoller(ctx.repoRoot, runId, "poller-2");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			out(ctx.json, `Registering poller-2 failed: ${msg}`);
		}
	} finally {
		cleanupRunDir(ctx.writeCheckpoint, ctx.writeLedger, runDir);
	}
}

async function parentProgressReconstruct(ctx: DryRunContext): Promise<void> {
	const runId = `dry-run-reconstruct-${Date.now()}`;
	const runDir = getRunDir(ctx.repoRoot, runId);
	try {
		out(ctx.json, `Initializing parent-progress-reconstruct scenario...`);
		await appendRunEvent(ctx.repoRoot, runId, "run.created", {});
		await appendRunEvent(ctx.repoRoot, runId, "run.state_changed", { state: "researching" });
		await appendRunEvent(ctx.repoRoot, runId, "agent.dispatched", { agentId: "researcher-1", role: "researcher" });
		await appendRunEvent(ctx.repoRoot, runId, "agent.claimed", { agentId: "researcher-1" });
		await appendRunEvent(ctx.repoRoot, runId, "agent.progress", {
			agentId: "researcher-1",
			progress: "Searching files...",
		});

		const reconstructed = await reconstructStateFromEvents(ctx.repoRoot, runId);
		if (!ctx.json) {
			process.stdout.write(`[Dry-Run] Reconstructed global run state: ${reconstructed.state}\n`);
			process.stdout.write(`[Dry-Run] Researcher state: ${reconstructed.agents["researcher-1"]?.state}\n`);
			process.stdout.write(`[Dry-Run] Researcher progress: ${reconstructed.agents["researcher-1"]?.lastProgress}\n`);
		}
	} finally {
		cleanupRunDir(ctx.writeCheckpoint, ctx.writeLedger, runDir);
	}
}

async function subagentWrongRoleEnvelope(ctx: DryRunContext): Promise<void> {
	const runId = `dry-run-wrong-role-${Date.now()}`;
	const runDir = getRunDir(ctx.repoRoot, runId);
	try {
		out(ctx.json, `Initializing subagent-wrong-role-envelope scenario...`);
		await appendRunEvent(ctx.repoRoot, runId, "run.created", {});
		await appendRunEvent(ctx.repoRoot, runId, "agent.dispatched", { agentId: "worker-1", role: "worker" });

		const wrongEnvelope = {
			runId,
			agentId: "worker-1",
			role: "researcher",
			status: "success",
			summary: "I completed the worker task",
			filesChanged: [],
			commandsRun: [],
			artifactsGenerated: [],
			blockers: [],
			nextRecommendedAction: "None",
			requiresParentAck: true,
		};

		try {
			validateResultEnvelope(wrongEnvelope, runId, "worker");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			out(ctx.json, `Rejects wrong role envelope: ${msg}`);
		}
	} finally {
		cleanupRunDir(ctx.writeCheckpoint, ctx.writeLedger, runDir);
	}
}
