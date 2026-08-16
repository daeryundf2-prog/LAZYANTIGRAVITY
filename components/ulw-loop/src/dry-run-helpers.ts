import { existsSync, rmSync } from "node:fs";
import { printJson } from "./cli-output.js";
import type { DryRunContext, DryRunState } from "./dry-run-types.js";
import { saveRoleCheckpoint } from "./role-checkpoint.js";

export function out(json: boolean, msg: string): void {
	if (!json) {
		process.stdout.write(`[Dry-Run] ${msg}\n`);
	}
}

export async function saveDryRunCheckpoint(ctx: DryRunContext, state: DryRunState, taskId: string): Promise<void> {
	if (!ctx.writeCheckpoint) return;
	state.checkpointPath = await saveRoleCheckpoint(ctx.repoRoot, {
		taskId,
		platform: "Antigravity",
		selectedModel: ctx.selectedModel,
		completedRoles: state.completedRoles,
		currentRole: state.failedRole ?? "",
		...(state.failedRole != null && { failedRole: state.failedRole }),
		...(state.errorType != null && { errorType: state.errorType }),
		filesChanged: [],
		commandsRun: [],
		artifactsGenerated: [],
		nextRecommendedAction: state.nextRecommendedAction,
		userResumeCommand: ctx.userResumeCommand,
		internalResumeCommand: ctx.internalResumeCommand,
		dryRun: true,
	});
	if (!ctx.json) {
		process.stdout.write(`[Dry-Run] Saved checkpoint: ${state.checkpointPath}\n`);
	}
}

export function cleanupRunDir(writeCheckpoint: boolean, writeLedger: boolean, runDir: string): void {
	if (!writeCheckpoint && !writeLedger && existsSync(runDir)) {
		rmSync(runDir, { recursive: true, force: true });
	}
}

export function printFinalOutput(state: DryRunState, ctx: DryRunContext, scenario: string): boolean {
	let isStagnationScenario = false;
	if (
		scenario === "same-error-loop" ||
		scenario === "oscillating-patch" ||
		scenario === "heartbeat-only-stall" ||
		scenario === "no-evidence-progress"
	) {
		isStagnationScenario = true;
	}

	if (ctx.json) {
		const finalizerAllowed = state.isQualityScenario ? state.qualityStatus === "passed" : false;
		printJson({
			ok: true,
			dryRun: true,
			finalizerAllowed,
			platform: ctx.platform,
			scenario,
			selectedModel: ctx.selectedModel,
			roles: ctx.allRoles,
			completedRoles: state.completedRoles,
			failedRole: state.failedRole,
			errorType: state.errorType,
			checkpointPath: state.checkpointPath,
			nextRecommendedAction: state.nextRecommendedAction,
			userResumeCommand: ctx.userResumeCommand,
			internalResumeCommand: ctx.internalResumeCommand,
			wouldCallModelApi: false,
			wouldModifySourceFiles: false,
			wouldSwitchModel: false,
			wouldFailRun: false,
			wouldCompleteRun: false,
			wouldKillSubagent: false,
			parentActionRequired: state.isQualityScenario ? state.qualityStatus !== "passed" : true,
			...(isStagnationScenario && {
				stagnationTriggered: true,
				stagnationReason: scenario,
				eventType: "parent.stagnation_detected",
			}),
			...(state.isQualityScenario && {
				qualityGateTriggered: true,
				qualityStage: state.qualityStage,
				qualityStatus: state.qualityStatus,
				eventType:
					state.qualityStatus === "passed"
						? state.qualityStage === "consensus"
							? "quality_gate.consensus_passed"
							: "quality_gate.completed"
						: state.qualityStatus === "required"
							? "quality_gate.consensus_required"
							: state.qualityStage === "consensus" && state.qualityStatus === "rework_required"
								? "quality_gate.consensus_rework_required"
								: state.qualityStage === "consensus" && state.qualityStatus === "inconclusive"
									? "quality_gate.consensus_inconclusive"
									: "quality_gate.failed",
			}),
			...(scenario === "hitl-scenario" && {
				hitlTriggered: true,
				hitlReason: "Hook execution failed. HITL required.",
				eventType: "parent.hitl_required",
			}),
		});
	} else {
		process.stdout.write(`[Dry-Run] Output details:\n`);
		process.stdout.write(`  Platform: ${ctx.platform}\n`);
		process.stdout.write(`  Selected Model: ${ctx.selectedModel}\n`);
		process.stdout.write(`  Scenario: ${scenario}\n`);
		process.stdout.write(`  Roles: ${ctx.allRoles.join(" -> ")}\n`);
		process.stdout.write(`  Completed Roles: ${state.completedRoles.join(", ")}\n`);
		process.stdout.write(`  Failed Role: ${state.failedRole || "None"}\n`);
		process.stdout.write(`  Error Type: ${state.errorType || "None"}\n`);
		process.stdout.write(`  Checkpoint Path: ${state.checkpointPath || "None"}\n`);
		process.stdout.write(`  Next Recommended Action: ${state.nextRecommendedAction || "None"}\n`);
		process.stdout.write(`  User Resume Command: ${ctx.userResumeCommand}\n`);
		process.stdout.write(`  Model Auto-Switch: Disabled (wouldSwitchModel: ${ctx.wouldSwitchModel})\n`);
		if (isStagnationScenario) {
			process.stdout.write(`  Stagnation Detected: true\n`);
			process.stdout.write(`  Event Type: parent.stagnation_detected\n`);
			process.stdout.write(`  Would Fail Run: false\n`);
			process.stdout.write(`  Would Kill Subagent: false\n`);
			process.stdout.write(`  Parent Action Required: true\n`);
		}
		if (state.isQualityScenario) {
			process.stdout.write(`  Quality Gate Triggered: true\n`);
			process.stdout.write(`  Quality Stage: ${state.qualityStage}\n`);
			process.stdout.write(`  Quality Status: ${state.qualityStatus}\n`);
			process.stdout.write(`  Would Fail Run: false\n`);
			process.stdout.write(`  Would Kill Subagent: false\n`);
		}
		if (scenario === "hitl-scenario") {
			process.stdout.write(`  HITL Triggered: true\n`);
			process.stdout.write(`  Event Type: parent.hitl_required\n`);
			process.stdout.write(`  Parent Action Required: true\n`);
		}
	}

	return false;
}
