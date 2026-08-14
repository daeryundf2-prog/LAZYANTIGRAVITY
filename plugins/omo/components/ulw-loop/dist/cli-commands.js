// biome-ignore-all format: keep cli-commands dispatcher under the 200 pure LOC budget.
import { readFile } from "node:fs/promises";
import { checkpointUlwLoop } from "./checkpoint.js";
import { hasFlag, parseCodexGoalJson, parseRecordEvidenceArgs, positionalText, readRepeated, readStdin, readValue } from "./cli-arg-parser.js";
import { blockedDecisionHandoff, normalizeCodexGoalMode, printJson, printStatus, ULW_LOOP_HELP } from "./cli-output.js";
import { parseSteeringProposal, printSteerResult } from "./cli-steering.js";
import { buildCodexGoalInstruction } from "./codex-goal-instruction.js";
import { dryRunCmd } from "./dry-run.js";
import { recordEvidence } from "./evidence.js";
import { resolveUlwLoopSessionIdFromEnv } from "./paths.js";
import { addUlwLoopGoal, createUlwLoopPlan, startNextUlwLoop, summarizeUlwLoopPlan } from "./plan-crud.js";
import { readUlwLoopPlan } from "./plan-io.js";
import { recordFinalReviewBlockers } from "./review-blockers.js";
import { findLatestRoleCheckpoint, saveRoleCheckpoint } from "./role-checkpoint.js";
import { steerUlwLoop } from "./steering.js";
import { UlwLoopError } from "./types.js";
export async function ulwLoopCommand(argv) {
    const command = argv[0] ?? "help";
    const rest = argv.slice(1);
    const repoRoot = process.cwd();
    const json = hasFlag(rest, "--json");
    const scope = commandScope(rest);
    try {
        switch (command) {
            case "help":
            case "--help":
            case "-h":
                process.stdout.write(`${ULW_LOOP_HELP}\n`);
                return 0;
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
            default:
                process.stdout.write(`${ULW_LOOP_HELP}\n`);
                return 1;
        }
    }
    catch (error) {
        if (error instanceof UlwLoopError)
            process.stderr.write(`[ulw-loop] ${error.message}\n`);
        else if (error instanceof Error)
            process.stderr.write(`[ulw-loop] unexpected: ${error.message}\n`);
        else
            process.stderr.write("[ulw-loop] unknown error\n");
        return 1;
    }
}
function commandScope(argv) {
    const sessionId = readValue(argv, "--session-id") ?? resolveUlwLoopSessionIdFromEnv();
    return sessionId === null ? undefined : { sessionId };
}
async function createGoals(repoRoot, argv, json, scope) {
    const briefFile = readValue(argv, "--brief-file");
    const brief = readValue(argv, "--brief") ?? (briefFile === undefined ? undefined : await readFile(briefFile, "utf8")) ?? (hasFlag(argv, "--from-stdin") ? await readStdin() : undefined) ?? positionalText(argv);
    if (!brief.trim())
        throw new UlwLoopError("Missing brief text. Pass --brief, --brief-file, --from-stdin, or positional text.", "ULW_LOOP_BRIEF_REQUIRED");
    const plan = await createUlwLoopPlan(repoRoot, { brief, codexGoalMode: normalizeCodexGoalMode(readValue(argv, "--codex-goal-mode")), force: hasFlag(argv, "--force") }, scope);
    if (json)
        printJson({ ok: true, plan, summary: summarizeUlwLoopPlan(plan) });
    else
        process.stdout.write(`ulw-loop plan created: ${plan.goals.length} goal(s)\nbrief: ${plan.briefPath}\ngoals: ${plan.goalsPath}\nledger: ${plan.ledgerPath}\n`);
    return 0;
}
async function status(repoRoot, json, scope) {
    const plan = await readUlwLoopPlan(repoRoot, scope);
    if (json)
        printJson({ ok: true, plan, summary: summarizeUlwLoopPlan(plan) });
    else
        printStatus(plan);
    return 0;
}
async function completeGoals(repoRoot, argv, json, scope) {
    const result = await startNextUlwLoop(repoRoot, { retryFailed: hasFlag(argv, "--retry-failed") }, scope);
    if ("done" in result) {
        const handoff = blockedDecisionHandoff(result.plan);
        if (json)
            printJson({ ok: true, done: true, blocked: handoff.length > 0, handoff, summary: summarizeUlwLoopPlan(result.plan), plan: result.plan });
        else
            process.stdout.write(`${handoff || "ulw-loop: all goals complete"}\n`);
        return 0;
    }
    const instruction = buildCodexGoalInstruction({ plan: result.plan, goal: result.goal });
    if (json)
        printJson({ ok: true, resumed: result.resumed, goal: result.goal, instruction, plan: result.plan });
    else
        process.stdout.write(`${instruction.text}\n`);
    return 0;
}
async function checkpoint(repoRoot, argv, json, scope) {
    const goalId = required(argv, "--goal-id");
    const statusValue = checkpointStatus(required(argv, "--status"));
    const evidence = required(argv, "--evidence");
    const codexGoalJson = await parseCodexGoalJson(statusValue === "complete" ? required(argv, "--codex-goal-json") : readValue(argv, "--codex-goal-json"));
    if (statusValue === "complete" && codexGoalJson === undefined)
        throw new UlwLoopError("Missing --codex-goal-json.", "ULW_LOOP_CODEX_GOAL_JSON_REQUIRED");
    const qualityGateJson = readValue(argv, "--quality-gate-json");
    const args = {
        goalId,
        status: statusValue,
        evidence,
        ...(codexGoalJson === undefined ? {} : { codexGoalJson }),
        ...(qualityGateJson === undefined ? {} : { qualityGateJson }),
    };
    const result = await checkpointUlwLoop(repoRoot, args, scope);
    if (json)
        printJson({ ok: true, ...result, summary: summarizeUlwLoopPlan(result.plan) });
    else
        process.stdout.write(`ulw-loop checkpoint: ${result.goal.id} -> ${result.goal.status}\n`);
    return 0;
}
async function steer(repoRoot, argv, json, scope) {
    const proposal = await parseSteeringProposal(argv);
    const result = await steerUlwLoop(repoRoot, proposal, scope);
    printSteerResult(result, json);
    return result.accepted ? 0 : 1;
}
async function addGoal(repoRoot, argv, json, scope) {
    const result = await addUlwLoopGoal(repoRoot, { title: required(argv, "--title"), objective: required(argv, "--objective") }, scope);
    if (json)
        printJson({ ok: true, plan: result.plan, goal: result.goal, summary: summarizeUlwLoopPlan(result.plan) });
    else {
        process.stdout.write(`ulw-loop added goal: ${result.goal.id}\n`);
        printStatus(result.plan);
    }
    return 0;
}
async function criteria(repoRoot, argv, json, scope) {
    const goalId = required(argv, "--goal-id");
    const goal = findGoal(await readUlwLoopPlan(repoRoot, scope), goalId);
    if (json)
        printJson({ ok: true, goalId: goal.id, criteria: goal.successCriteria });
    else
        process.stdout.write(`criteria for ${goal.id}:\n${goal.successCriteria.map((c) => `- ${c.id} [${c.status}] (${c.userModel}) ${c.scenario} evidence: ${c.capturedEvidence ?? "pending"}`).join("\n")}\n`);
    return 0;
}
async function captureEvidence(repoRoot, argv, json, scope) {
    const result = await recordEvidence(repoRoot, parseRecordEvidenceArgs(argv), scope);
    if (json)
        printJson({ ok: true, ...result, summary: summarizeUlwLoopPlan(result.plan) });
    else
        process.stdout.write(`ulw-loop evidence recorded: ${result.goal.id}/${result.criterion.id} -> ${result.criterion.status}\n`);
    return 0;
}
async function reviewBlockers(repoRoot, argv, json, scope) {
    const codexGoalJson = await parseCodexGoalJson(required(argv, "--codex-goal-json"));
    if (codexGoalJson === undefined)
        throw new UlwLoopError("Missing --codex-goal-json.", "ULW_LOOP_CODEX_GOAL_JSON_REQUIRED");
    const result = await recordFinalReviewBlockers(repoRoot, { goalId: required(argv, "--goal-id"), title: required(argv, "--title"), objective: required(argv, "--objective"), evidence: required(argv, "--evidence"), codexGoalJson }, scope);
    if (json)
        printJson({ ok: true, plan: result.plan, blockedGoal: result.blockedGoal, goal: result.newGoal, ledgerEntries: result.ledgerEntries, summary: summarizeUlwLoopPlan(result.plan) });
    else
        process.stdout.write(`ulw-loop final review blockers recorded: ${result.blockedGoal.id} -> review_blocked; added ${result.newGoal.id}\n`);
    return 0;
}
function required(argv, flag) {
    const value = readValue(argv, flag)?.trim();
    if (value)
        return value;
    throw new UlwLoopError(`Missing ${flag}.`, "ULW_LOOP_ARGUMENT_MISSING", { details: { flag } });
}
function checkpointStatus(value) {
    if (value === "complete" || value === "failed" || value === "blocked")
        return value;
    throw new UlwLoopError("Missing or invalid --status; expected complete, failed, or blocked.", "ULW_LOOP_STATUS_INVALID", { details: { status: value } });
}
function findGoal(plan, goalId) {
    const goal = plan.goals.find((candidate) => candidate.id === goalId);
    if (goal !== undefined)
        return goal;
    throw new UlwLoopError(`Unknown ulw-loop id: ${goalId}.`, "ULW_LOOP_GOAL_NOT_FOUND", { details: { goalId } });
}
async function saveRoleCheckpointCmd(repoRoot, argv, json) {
    const taskId = required(argv, "--task-id");
    const platform = required(argv, "--platform");
    const selectedModel = required(argv, "--selected-model");
    const completedRoles = readList(argv, "--completed-roles");
    const currentRole = required(argv, "--current-role");
    const failedRole = readValue(argv, "--failed-role");
    const errorType = readValue(argv, "--error-type");
    const filesChanged = readList(argv, "--files-changed");
    const commandsRun = readList(argv, "--commands-run");
    const artifactsGenerated = readList(argv, "--artifacts-generated");
    const nextRecommendedAction = required(argv, "--next-recommended-action");
    const userResumeCommand = readValue(argv, "--user-resume-command") || "/ulw resume";
    let internalResumeCommand = readValue(argv, "--internal-resume-command");
    if (!internalResumeCommand) {
        internalResumeCommand = readValue(argv, "--resume-command") || "omo ulw-loop resume";
    }
    const path = await saveRoleCheckpoint(repoRoot, {
        taskId,
        platform,
        selectedModel,
        completedRoles,
        currentRole,
        filesChanged,
        commandsRun,
        artifactsGenerated,
        nextRecommendedAction,
        userResumeCommand,
        internalResumeCommand,
        ...(failedRole !== undefined ? { failedRole } : {}),
        ...(errorType !== undefined ? { errorType } : {}),
    });
    if (json) {
        printJson({ ok: true, checkpointPath: path });
    }
    else {
        process.stdout.write(`Saved role checkpoint: ${path}\n`);
    }
    return 0;
}
async function resumeCmd(repoRoot, json) {
    const checkpoint = await findLatestRoleCheckpoint(repoRoot);
    if (!checkpoint) {
        if (json) {
            printJson({ ok: false, error: "No checkpoints found" });
        }
        else {
            process.stderr.write("No checkpoints found. Cannot resume.\n");
        }
        return 1;
    }
    if (json) {
        printJson({ ok: true, checkpoint });
    }
    else {
        process.stdout.write(`Resuming ulw-loop workflow:\n`);
        process.stdout.write(`  Task ID: ${checkpoint.taskId}\n`);
        process.stdout.write(`  Platform: ${checkpoint.platform}\n`);
        process.stdout.write(`  Selected Model: ${checkpoint.selectedModel}\n`);
        process.stdout.write(`  Completed Roles: ${checkpoint.completedRoles.join(", ")}\n`);
        process.stdout.write(`  Current/Failed Role to Resume: ${checkpoint.currentRole}\n`);
        if (checkpoint.failedRole)
            process.stdout.write(`  Failed Role: ${checkpoint.failedRole}\n`);
        if (checkpoint.errorType)
            process.stdout.write(`  Error Type: ${checkpoint.errorType}\n`);
        if (checkpoint.filesChanged.length > 0)
            process.stdout.write(`  Files Changed: ${checkpoint.filesChanged.join(", ")}\n`);
        if (checkpoint.commandsRun.length > 0)
            process.stdout.write(`  Commands Run: ${checkpoint.commandsRun.join(", ")}\n`);
        if (checkpoint.artifactsGenerated.length > 0)
            process.stdout.write(`  Artifacts Generated: ${checkpoint.artifactsGenerated.join(", ")}\n`);
        process.stdout.write(`\n`);
        process.stdout.write(`  Next Recommended Action: ${checkpoint.nextRecommendedAction}\n`);
        process.stdout.write(`  User Resume Command (Recommended): ${checkpoint.userResumeCommand || "/ulw resume"}\n`);
        process.stdout.write(`  Internal Resume Command: ${checkpoint.internalResumeCommand || checkpoint.resumeCommand || "omo ulw-loop resume"}\n`);
    }
    return 0;
}
function readList(argv, flag) {
    const repeated = readRepeated(argv, flag);
    const values = [];
    if (repeated.length > 0) {
        for (const val of repeated) {
            for (const part of val.split(",")) {
                const trimmed = part.trim();
                if (trimmed)
                    values.push(trimmed);
            }
        }
        return values;
    }
    const single = readValue(argv, flag);
    if (!single)
        return [];
    return single.split(",").map((s) => s.trim()).filter(Boolean);
}
