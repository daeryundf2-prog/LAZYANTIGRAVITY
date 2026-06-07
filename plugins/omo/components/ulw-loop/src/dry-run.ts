import { printJson } from "./cli-output.js";
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
					"provider-unavailable"
				],
				options: [
					"--scenario",
					"--json",
					"--write-checkpoint",
					"--persist-checkpoint"
				]
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
