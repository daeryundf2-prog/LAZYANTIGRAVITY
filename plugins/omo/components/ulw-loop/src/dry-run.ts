import { existsSync, rmSync } from "node:fs";
import { printJson } from "./cli-output.js";
import {
	appendRunEvent,
	checkLeases,
	getRunDir,
	reconstructStateFromEvents,
	registerPoller,
	validateResultEnvelope,
} from "./control-plane.js";
import { saveRoleCheckpoint, type UlwLimitErrorType } from "./role-checkpoint.js";

export async function dryRunCmd(repoRoot: string, argv: readonly string[], json: boolean): Promise<number> {
	if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
		const usage = `Usage:
  omo ulw-loop dry-run [--scenario <scenario>] [--json] [--write-checkpoint | --persist-checkpoint]

Scenarios:
  happy-path                 Simulates a fully successful role execution flow without errors
  quota-opus-exhausted       Simulates a Claude Opus quota exhausted / model_rate_limited failure
  context-window-exceeded    Simulates context window limit hit with Compact Mode transition
  output-token-limit         Simulates output token limit hit with Batch Mode transition
  provider-unavailable       Simulates provider API endpoint down with retry mitigation
  subagent-self-finalizes    Simulates subagent attempting to self-finalize the global run
  stale-heartbeat-missed     Simulates a subagent lease expiration transitioning to stale_candidate
  polling-loop-prevented     Simulates prevention of multiple active pollers on a run
  parent-progress-reconstruct Reconstructs run progress from an events ledger file
  subagent-wrong-role-envelope Simulates rejection of a subagent with mismatched role envelope
  same-error-loop            Simulates a subagent stuck in an identical error loop
  oscillating-patch          Simulates a subagent generating A/B/A/B alternating patches
  heartbeat-only-stall       Simulates a subagent sending heartbeats but no progress
  no-evidence-progress       Simulates a subagent reporting progress without actionable evidence

Options:
  --scenario <scenario>      Select the simulation scenario (default: happy-path)
  --json                     Output details in machine-readable JSON format
  --write-checkpoint         Actually write a dry-run checkpoint to .lazycodex/checkpoints/
  --persist-checkpoint       Alias for --write-checkpoint`;

		if (json) {
			printJson({
				ok: true,
				dryRun: true,
				usage: true,
				scenarios: [
					"happy-path",
					"quota-opus-exhausted",
					"context-window-exceeded",
					"output-token-limit",
					"provider-unavailable",
					"subagent-self-finalizes",
					"stale-heartbeat-missed",
					"polling-loop-prevented",
					"parent-progress-reconstruct",
					"subagent-wrong-role-envelope",
					"same-error-loop",
					"oscillating-patch",
					"heartbeat-only-stall",
					"no-evidence-progress",
				],
				options: ["--scenario", "--json", "--write-checkpoint", "--persist-checkpoint"],
			});
		} else {
			process.stdout.write(`${usage}\n`);
		}
		return 0;
	}

	const writeCheckpoint = argv.includes("--write-checkpoint") || argv.includes("--persist-checkpoint");

	// Find scenario argument or default to happy-path
	let scenario = "happy-path";
	const scenarioIdx = argv.indexOf("--scenario");
	if (scenarioIdx !== -1) {
		const val = argv[scenarioIdx + 1];
		if (val) {
			scenario = val;
		}
	}

	const platform = "Antigravity";
	const selectedModel = "Claude Opus 4.6 (Thinking)";
	const userResumeCommand = "/ulw resume";
	const internalResumeCommand = "omo ulw-loop resume";
	const wouldSwitchModel = false;

	const allRoles = ["planner", "researcher", "worker", "verifier", "finalizer"];
	const wouldInvokeSubagents = [
		{ TypeName: "self", Role: "Prometheus Planner" },
		{ TypeName: "research", Role: "Codebase Researcher" },
		{ TypeName: "self", Role: "Hephaestus Worker" },
		{ TypeName: "self", Role: "Oracle Reviewer" },
	];

	let completedRoles: string[] = [];
	let failedRole: string | null = null;
	let errorType: UlwLimitErrorType | null = null;
	let checkpointPath: string | null = null;
	let nextRecommendedAction = "";

	// Simulate based on scenario
	if (scenario === "happy-path") {
		completedRoles = [...allRoles];
		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
			process.stdout.write(`[Dry-Run] Antigravity Model Recommendation:\n`);
			process.stdout.write(`  - Claude Opus 4.6 (Thinking)\n`);
			process.stdout.write(`  - Gemini 3.1 Pro (High)\n`);
			process.stdout.write(`  - Gemini 3.5 Flash (High)\n`);
			process.stdout.write(`  - Gemini 3.5 Flash (Medium)\n`);
			process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner)\n`);
			process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher)\n`);
			process.stdout.write(`[Dry-Run] Running role: worker (would invoke: self / Hephaestus Worker)\n`);
			process.stdout.write(`[Dry-Run] Running role: verifier (would invoke: self / Oracle Reviewer)\n`);
			process.stdout.write(`[Dry-Run] Running role: finalizer (would run in parent agent)\n`);
			process.stdout.write(`[Dry-Run] Happy-path complete successfully!\n`);
		}
	} else if (scenario === "quota-opus-exhausted") {
		completedRoles = ["planner", "researcher"];
		failedRole = "worker";
		errorType = "model_rate_limited";
		nextRecommendedAction = "Switch to Gemini 3.1 Pro (High) in Antigravity UI and run /ulw resume";

		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
			process.stdout.write(`[Dry-Run] Antigravity Model Recommendation:\n`);
			process.stdout.write(`  - Claude Opus 4.6 (Thinking)\n`);
			process.stdout.write(`  - Gemini 3.1 Pro (High)\n`);
			process.stdout.write(`  - Gemini 3.5 Flash (High)\n`);
			process.stdout.write(`  - Gemini 3.5 Flash (Medium)\n`);
			process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
			process.stdout.write(
				`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - SUCCESS\n`,
			);
			process.stdout.write(`[Dry-Run] Running role: worker (would invoke: self / Hephaestus Worker) - FAILED\n`);
			process.stdout.write(`[Dry-Run] Error: model_rate_limited (Claude Opus 4.6 Thinking quota exhausted)\n`);
			process.stdout.write(`[Dry-Run] Quota/Rate limit detected in Antigravity: Immediately stopping loop.\n`);
			process.stdout.write(
				`[Dry-Run] Fallback Recommendation: Switch to Gemini 3.1 Pro (High) in Antigravity UI and run /ulw resume.\n`,
			);
			process.stdout.write(`[Dry-Run] Automatic model switching: Disabled (wouldSwitchModel: false)\n`);
		}

		// Save a mock checkpoint
		if (writeCheckpoint) {
			checkpointPath = await saveRoleCheckpoint(repoRoot, {
				taskId: "dry-run-task-quota",
				platform: "Antigravity",
				selectedModel,
				completedRoles,
				currentRole: failedRole,
				failedRole,
				errorType,
				filesChanged: [],
				commandsRun: [],
				artifactsGenerated: [],
				nextRecommendedAction,
				userResumeCommand,
				internalResumeCommand,
				dryRun: true,
			});
			if (!json) {
				process.stdout.write(`[Dry-Run] Saved checkpoint: ${checkpointPath}\n`);
			}
		}
	} else if (scenario === "context-window-exceeded") {
		completedRoles = ["planner"];
		failedRole = "researcher";
		errorType = "context_window_exceeded";
		nextRecommendedAction = "Switch to Gemini 3.5 Flash (High) and run /ulw resume in Compact Mode";

		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
			process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
			process.stdout.write(
				`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - FAILED\n`,
			);
			process.stdout.write(`[Dry-Run] Error: context_window_exceeded\n`);
			process.stdout.write(
				`[Dry-Run] Transitioning to Compact Mode: Summarizing logs, using relevant slices of files, and referencing large outputs via paths.\n`,
			);
		}

		if (writeCheckpoint) {
			checkpointPath = await saveRoleCheckpoint(repoRoot, {
				taskId: "dry-run-task-context",
				platform: "Antigravity",
				selectedModel,
				completedRoles,
				currentRole: failedRole,
				failedRole,
				errorType,
				filesChanged: [],
				commandsRun: [],
				artifactsGenerated: [],
				nextRecommendedAction,
				userResumeCommand,
				internalResumeCommand,
				dryRun: true,
			});
			if (!json) {
				process.stdout.write(`[Dry-Run] Saved checkpoint: ${checkpointPath}\n`);
			}
		}
	} else if (scenario === "output-token-limit") {
		completedRoles = ["planner", "researcher"];
		failedRole = "worker";
		errorType = "output_token_limit";
		nextRecommendedAction = "Enable Batch Mode, split edits into smaller patch batches, and run /ulw resume";

		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
			process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
			process.stdout.write(
				`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - SUCCESS\n`,
			);
			process.stdout.write(`[Dry-Run] Running role: worker (would invoke: self / Hephaestus Worker) - FAILED\n`);
			process.stdout.write(`[Dry-Run] Error: output_token_limit\n`);
			process.stdout.write(
				`[Dry-Run] Transitioning to Batch Mode: Dividing changes into multiple smaller patch batches and validating incrementally.\n`,
			);
		}

		if (writeCheckpoint) {
			checkpointPath = await saveRoleCheckpoint(repoRoot, {
				taskId: "dry-run-task-output",
				platform: "Antigravity",
				selectedModel,
				completedRoles,
				currentRole: failedRole,
				failedRole,
				errorType,
				filesChanged: [],
				commandsRun: [],
				artifactsGenerated: [],
				nextRecommendedAction,
				userResumeCommand,
				internalResumeCommand,
				dryRun: true,
			});
			if (!json) {
				process.stdout.write(`[Dry-Run] Saved checkpoint: ${checkpointPath}\n`);
			}
		}
	} else if (scenario === "provider-unavailable") {
		completedRoles = ["planner"];
		failedRole = "researcher";
		errorType = "provider_unavailable";
		nextRecommendedAction = "Wait for provider endpoint recovery or check network status, then run /ulw resume";

		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
			process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
			process.stdout.write(
				`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - FAILED\n`,
			);
			process.stdout.write(`[Dry-Run] Error: provider_unavailable (API Endpoint Down)\n`);
			process.stdout.write(
				`[Dry-Run] Preventing infinite retry loops: Halting execution. Recommended fallback or wait before re-trying.\n`,
			);
		}

		if (writeCheckpoint) {
			checkpointPath = await saveRoleCheckpoint(repoRoot, {
				taskId: "dry-run-task-provider",
				platform: "Antigravity",
				selectedModel,
				completedRoles,
				currentRole: failedRole,
				failedRole,
				errorType,
				filesChanged: [],
				commandsRun: [],
				artifactsGenerated: [],
				nextRecommendedAction,
				userResumeCommand,
				internalResumeCommand,
				dryRun: true,
			});
			if (!json) {
				process.stdout.write(`[Dry-Run] Saved checkpoint: ${checkpointPath}\n`);
			}
		}
	} else if (scenario === "subagent-self-finalizes") {
		const runId = `dry-run-self-finalizes-${Date.now()}`;
		const runDir = getRunDir(repoRoot, runId);
		try {
			if (!json) {
				process.stdout.write(`[Dry-Run] Initializing subagent-self-finalizes scenario...\n`);
			}
			await appendRunEvent(repoRoot, runId, "run.created", {});
			await appendRunEvent(repoRoot, runId, "run.state_changed", { state: "working" });
			await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId: "worker-1", role: "worker" });
			await appendRunEvent(repoRoot, runId, "agent.claimed", { agentId: "worker-1" });

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

			if (!json) {
				process.stdout.write(`[Dry-Run] Subagent worker-1 reports completion with self-finalizing phrase.\n`);
			}

			try {
				validateResultEnvelope(badResult, runId, "worker");
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!json) {
					process.stdout.write(`[Dry-Run] Parent rejected result envelope: ${msg}\n`);
				}
				await appendRunEvent(repoRoot, runId, "parent.rejected", { agentId: "worker-1", reason: msg });
			}

			const state = await reconstructStateFromEvents(repoRoot, runId);
			if (!json) {
				process.stdout.write(`[Dry-Run] Reconstructed agent state: ${state.agents["worker-1"]?.state}\n`);
			}
		} finally {
			if (!writeCheckpoint && existsSync(runDir)) {
				rmSync(runDir, { recursive: true, force: true });
			}
		}
	} else if (scenario === "stale-heartbeat-missed") {
		const runId = `dry-run-stale-${Date.now()}`;
		const runDir = getRunDir(repoRoot, runId);
		try {
			if (!json) {
				process.stdout.write(`[Dry-Run] Initializing stale-heartbeat-missed scenario...\n`);
			}
			await appendRunEvent(repoRoot, runId, "run.created", {});
			await appendRunEvent(repoRoot, runId, "run.state_changed", { state: "working" });
			await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId: "worker-stale", role: "worker" });
			await appendRunEvent(repoRoot, runId, "agent.claimed", { agentId: "worker-stale" });

			const futureTime = new Date(Date.now() + 150000); // 150 seconds later (> 120s max lease)
			const state = await checkLeases(repoRoot, runId, futureTime);
			if (!json) {
				process.stdout.write(`[Dry-Run] Checking leases at future time: ${futureTime.toISOString()}\n`);
				process.stdout.write(
					`[Dry-Run] Agent worker-stale assignment state: ${state.agents["worker-stale"]?.state}\n`,
				);
			}
		} finally {
			if (!writeCheckpoint && existsSync(runDir)) {
				rmSync(runDir, { recursive: true, force: true });
			}
		}
	} else if (scenario === "polling-loop-prevented") {
		const runId = `dry-run-polling-${Date.now()}`;
		const runDir = getRunDir(repoRoot, runId);
		try {
			if (!json) {
				process.stdout.write(`[Dry-Run] Initializing polling-loop-prevented scenario...\n`);
			}
			await appendRunEvent(repoRoot, runId, "run.created", {});
			await registerPoller(repoRoot, runId, "poller-1");
			if (!json) {
				process.stdout.write(`[Dry-Run] Registered poller-1 successfully.\n`);
			}

			try {
				await registerPoller(repoRoot, runId, "poller-2");
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!json) {
					process.stdout.write(`[Dry-Run] Registering poller-2 failed: ${msg}\n`);
				}
			}
		} finally {
			if (!writeCheckpoint && existsSync(runDir)) {
				rmSync(runDir, { recursive: true, force: true });
			}
		}
	} else if (scenario === "parent-progress-reconstruct") {
		const runId = `dry-run-reconstruct-${Date.now()}`;
		const runDir = getRunDir(repoRoot, runId);
		try {
			if (!json) {
				process.stdout.write(`[Dry-Run] Initializing parent-progress-reconstruct scenario...\n`);
			}
			await appendRunEvent(repoRoot, runId, "run.created", {});
			await appendRunEvent(repoRoot, runId, "run.state_changed", { state: "researching" });
			await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId: "researcher-1", role: "researcher" });
			await appendRunEvent(repoRoot, runId, "agent.claimed", { agentId: "researcher-1" });
			await appendRunEvent(repoRoot, runId, "agent.progress", {
				agentId: "researcher-1",
				progress: "Searching files...",
			});

			const state = await reconstructStateFromEvents(repoRoot, runId);
			if (!json) {
				process.stdout.write(`[Dry-Run] Reconstructed global run state: ${state.state}\n`);
				process.stdout.write(`[Dry-Run] Researcher state: ${state.agents["researcher-1"]?.state}\n`);
				process.stdout.write(`[Dry-Run] Researcher progress: ${state.agents["researcher-1"]?.lastProgress}\n`);
			}
		} finally {
			if (!writeCheckpoint && existsSync(runDir)) {
				rmSync(runDir, { recursive: true, force: true });
			}
		}
	} else if (scenario === "subagent-wrong-role-envelope") {
		const runId = `dry-run-wrong-role-${Date.now()}`;
		const runDir = getRunDir(repoRoot, runId);
		try {
			if (!json) {
				process.stdout.write(`[Dry-Run] Initializing subagent-wrong-role-envelope scenario...\n`);
			}
			await appendRunEvent(repoRoot, runId, "run.created", {});
			await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId: "worker-1", role: "worker" });

			const wrongEnvelope = {
				runId,
				agentId: "worker-1",
				role: "researcher", // Wrong role! Expected worker
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
				if (!json) {
					process.stdout.write(`[Dry-Run] Rejects wrong role envelope: ${msg}\n`);
				}
			}
		} finally {
			if (!writeCheckpoint && existsSync(runDir)) {
				rmSync(runDir, { recursive: true, force: true });
			}
		}
	} else if (scenario === "same-error-loop") {
		completedRoles = ["planner"];
		failedRole = null;
		nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing same-error-loop scenario...\n`);
			process.stdout.write(`[Dry-Run] Subagent worker repeatedly failing with identical errors.\n`);
			process.stdout.write(`[Dry-Run] StagnationGuard triggered: same_error_loop\n`);
			process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
		}
	} else if (scenario === "oscillating-patch") {
		completedRoles = ["planner"];
		failedRole = null;
		nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing oscillating-patch scenario...\n`);
			process.stdout.write(`[Dry-Run] Subagent generating A/B/A/B alternating patches.\n`);
			process.stdout.write(`[Dry-Run] StagnationGuard triggered: oscillation_detected\n`);
			process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
		}
	} else if (scenario === "heartbeat-only-stall") {
		completedRoles = ["planner"];
		failedRole = null;
		nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing heartbeat-only-stall scenario...\n`);
			process.stdout.write(`[Dry-Run] Subagent sending heartbeats but no progress.\n`);
			process.stdout.write(`[Dry-Run] StagnationGuard triggered: heartbeat_only_stall\n`);
			process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
		}
	} else if (scenario === "no-evidence-progress") {
		completedRoles = ["planner"];
		failedRole = null;
		nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
		if (!json) {
			process.stdout.write(`[Dry-Run] Initializing no-evidence-progress scenario...\n`);
			process.stdout.write(`[Dry-Run] Subagent reporting progress without actionable evidence.\n`);
			process.stdout.write(`[Dry-Run] StagnationGuard triggered: no_evidence_progress\n`);
			process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
		}
	} else {
		process.stderr.write(`[Dry-Run] Unknown scenario: ${scenario}\n`);
		return 1;
	}

	if (json) {
		printJson({
			ok: true,
			dryRun: true,
			platform,
			scenario,
			selectedModel,
			roles: allRoles,
			completedRoles,
			failedRole,
			errorType,
			checkpointPath,
			nextRecommendedAction,
			userResumeCommand,
			internalResumeCommand,
			wouldInvokeSubagents,
			wouldSwitchModel,
			wouldCallModelApi: false,
			wouldModifySourceFiles: false,
		});
	} else {
		process.stdout.write(`[Dry-Run] Output details:\n`);
		process.stdout.write(`  Platform: ${platform}\n`);
		process.stdout.write(`  Selected Model: ${selectedModel}\n`);
		process.stdout.write(`  Scenario: ${scenario}\n`);
		process.stdout.write(`  Roles: ${allRoles.join(" -> ")}\n`);
		process.stdout.write(`  Completed Roles: ${completedRoles.join(", ")}\n`);
		process.stdout.write(`  Failed Role: ${failedRole || "None"}\n`);
		process.stdout.write(`  Error Type: ${errorType || "None"}\n`);
		process.stdout.write(`  Checkpoint Path: ${checkpointPath || "None"}\n`);
		process.stdout.write(`  Next Recommended Action: ${nextRecommendedAction || "None"}\n`);
		process.stdout.write(`  User Resume Command: ${userResumeCommand}\n`);
		process.stdout.write(`  Model Auto-Switch: Disabled (wouldSwitchModel: ${wouldSwitchModel})\n`);
	}

	return 0;
}
