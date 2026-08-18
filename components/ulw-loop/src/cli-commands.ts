import { hasFlag, readRepeated, readValue } from "./cli-arg-parser.js";
import { ackAgentCmd, aggregateConsensusCmd, checkLeasesCmd, claimAgentCmd, dispatchAgentCmd, dispatchConsensusCmd, heartbeatAgentCmd, initRunCmd, progressAgentCmd, registerPollerCmd, rejectAgentCmd, reportCompleteCmd, reportConsensusResultCmd, reportFailedCmd, rewindRunCmd, setRunStateCmd } from "./cli-control-plane.js";
import { verifyLedgerCmd } from "./cli-ledger.js";
import { printJson, ULW_LOOP_HELP } from "./cli-output.js";
import { addGoal, captureEvidence, checkpoint, completeGoals, createGoals, criteria, reviewBlockers, status, steer } from "./cli-plan-commands.js";
import { dryRunCmd } from "./dry-run.js";
import { resolveUlwLoopSessionIdFromEnv, type UlwLoopScope } from "./paths.js";
import { findLatestRoleCheckpoint, saveRoleCheckpoint, type UlwLimitErrorType } from "./role-checkpoint.js";
import { UlwLoopError } from "./types.js";

export async function ulwLoopCommand(argv: readonly string[]): Promise<number> {
	const command = argv[0] ?? "help";
	const rest = argv.slice(1);
	const repoRoot = process.cwd();
	const json = hasFlag(rest, "--json");
	const scope = commandScope(rest);
	try {
		switch (command) {
			case "help": case "--help": case "-h": process.stdout.write(`${ULW_LOOP_HELP}\n`); return 0;
			case "create-goals": return await createGoals(repoRoot, rest, json, scope);
			case "status": return await status(repoRoot, json, scope);
			case "complete-goals": return await completeGoals(repoRoot, rest, json, scope);
			case "checkpoint": return await checkpoint(repoRoot, rest, json, scope);
			case "steer": return await steer(repoRoot, rest, json, scope);
			case "add-goal": return await addGoal(repoRoot, rest, json, scope);
			case "criteria": return await criteria(repoRoot, rest, json, scope);
			case "record-evidence": return await captureEvidence(repoRoot, rest, json, scope);
			case "record-review-blockers": return await reviewBlockers(repoRoot, rest, json, scope);
			case "save-role-checkpoint": return await saveRoleCheckpointCmd(repoRoot, rest, json);
			case "resume": return await resumeCmd(repoRoot, json);
			case "dry-run": return await dryRunCmd(repoRoot, rest, json);
			case "init-run": return await initRunCmd(repoRoot, rest, json);
			case "set-run-state": return await setRunStateCmd(repoRoot, rest, json);
			case "dispatch-agent": return await dispatchAgentCmd(repoRoot, rest, json);
			case "claim-agent": return await claimAgentCmd(repoRoot, rest, json);
			case "heartbeat-agent": return await heartbeatAgentCmd(repoRoot, rest, json);
			case "progress-agent": return await progressAgentCmd(repoRoot, rest, json);
			case "report-complete": return await reportCompleteCmd(repoRoot, rest, json);
			case "report-failed": return await reportFailedCmd(repoRoot, rest, json);
			case "ack-agent": return await ackAgentCmd(repoRoot, rest, json);
			case "reject-agent": return await rejectAgentCmd(repoRoot, rest, json);
			case "check-leases": return await checkLeasesCmd(repoRoot, rest, json);
			case "register-poller": return await registerPollerCmd(repoRoot, rest, json);
			case "rewind": return await rewindRunCmd(repoRoot, rest, json);
			case "dispatch-consensus": return await dispatchConsensusCmd(repoRoot, rest, json);
			case "report-consensus-result": return await reportConsensusResultCmd(repoRoot, rest, json);
			case "aggregate-consensus": return await aggregateConsensusCmd(repoRoot, rest, json);
			case "verify-ledger": return await verifyLedgerCmd(repoRoot, rest, json, scope);
			default: process.stdout.write(`${ULW_LOOP_HELP}\n`); return 1;
		}
	} catch (error) {
		if (error instanceof UlwLoopError) process.stderr.write(`[ulw-loop] ${error.message}\n`);
		else if (error instanceof Error) process.stderr.write(`[ulw-loop] unexpected: ${error.message}\n`);
		else process.stderr.write("[ulw-loop] unknown error\n");
		return 1;
	}
}

function commandScope(argv: readonly string[]): UlwLoopScope | undefined {
	const sessionId = readValue(argv, "--session-id") ?? resolveUlwLoopSessionIdFromEnv();
	return sessionId === null ? undefined : { sessionId };
}

function readList(argv: readonly string[], flag: string): string[] {
	const repeated = readRepeated(argv, flag);
	if (repeated.length > 0) {
		return repeated.flatMap((val) => val.split(",").map((s) => s.trim()).filter(Boolean));
	}
	const single = readValue(argv, flag);
	if (!single) return [];
	return single.split(",").map((s) => s.trim()).filter(Boolean);
}

function requiredArg(argv: readonly string[], flag: string): string {
	const value = readValue(argv, flag)?.trim();
	if (value) return value;
	throw new UlwLoopError(`Missing ${flag}.`, "ULW_LOOP_ARGUMENT_MISSING");
}

async function saveRoleCheckpointCmd(repoRoot: string, argv: readonly string[], json: boolean): Promise<number> {
	const failedRole = readValue(argv, "--failed-role")?.trim();
	const errorType = readValue(argv, "--error-type")?.trim() as UlwLimitErrorType | undefined;

	const path = await saveRoleCheckpoint(repoRoot, {
		taskId: requiredArg(argv, "--task-id"),
		platform: requiredArg(argv, "--platform") as "Antigravity" | "Codex",
		selectedModel: requiredArg(argv, "--selected-model"),
		completedRoles: readList(argv, "--completed-roles"),
		currentRole: requiredArg(argv, "--current-role"),
		filesChanged: readList(argv, "--files-changed"),
		commandsRun: readList(argv, "--commands-run"),
		artifactsGenerated: readList(argv, "--artifacts-generated"),
		nextRecommendedAction: requiredArg(argv, "--next-recommended-action"),
		userResumeCommand: readValue(argv, "--user-resume-command") || "/ulw resume",
		internalResumeCommand: readValue(argv, "--internal-resume-command") || readValue(argv, "--resume-command") || "omo ulw-loop resume",
		...(failedRole ? { failedRole } : {}),
		...(errorType ? { errorType } : {}),
	});
	if (json) printJson({ ok: true, checkpointPath: path });
	else process.stdout.write(`Saved role checkpoint: ${path}\n`);
	return 0;
}

async function resumeCmd(repoRoot: string, json: boolean): Promise<number> {
	const checkpoint = await findLatestRoleCheckpoint(repoRoot);
	if (!checkpoint) {
		if (json) printJson({ ok: false, error: "No checkpoints found" });
		else process.stderr.write("No checkpoints found. Cannot resume.\n");
		return 1;
	}
	if (json) {
		printJson({ ok: true, checkpoint });
	} else {
		process.stdout.write(`Resuming ulw-loop workflow:\n  Task ID: ${checkpoint.taskId}\n  Platform: ${checkpoint.platform}\n  Selected Model: ${checkpoint.selectedModel}\n  Completed Roles: ${checkpoint.completedRoles.join(", ")}\n  Current/Failed Role to Resume: ${checkpoint.currentRole}\n${checkpoint.failedRole ? `  Failed Role: ${checkpoint.failedRole}\n` : ""}${checkpoint.errorType ? `  Error Type: ${checkpoint.errorType}\n` : ""}${checkpoint.filesChanged.length > 0 ? `  Files Changed: ${checkpoint.filesChanged.join(", ")}\n` : ""}${checkpoint.commandsRun.length > 0 ? `  Commands Run: ${checkpoint.commandsRun.join(", ")}\n` : ""}${checkpoint.artifactsGenerated.length > 0 ? `  Artifacts Generated: ${checkpoint.artifactsGenerated.join(", ")}\n` : ""}\n  Next Recommended Action: ${checkpoint.nextRecommendedAction}\n  User Resume Command (Recommended): ${checkpoint.userResumeCommand || "/ulw resume"}\n  Internal Resume Command: ${checkpoint.internalResumeCommand || (checkpoint as { resumeCommand?: string }).resumeCommand || "omo ulw-loop resume"}\n`);
	}
	return 0;
}
