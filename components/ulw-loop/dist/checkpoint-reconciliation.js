import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatCodexGoalReconciliation, readCodexGoalSnapshotInput, reconcileCodexGoalSnapshot, } from "./codex-goal-snapshot.js";
import { codexGoalMode, compatibleCodexObjectives, expectedCodexObjective, isFinalRunCompletionCandidate, } from "./goal-status.js";
import { ulwLoopBriefPath } from "./paths.js";
import { validateQualityGate } from "./quality-gate.js";
import { ULW_LOOP_DIR, ULW_LOOP_GOALS, ULW_LOOP_LEDGER, UlwLoopError } from "./types.js";
export function makeAggregateCompletion(completedAt, evidence, codexGoal) {
    return {
        status: "complete",
        completedAt,
        evidence,
        codexGoal,
    };
}
export function textMentionsUlwLoopPlanArtifact(value) {
    const normalized = (value ?? "").toLowerCase();
    return (normalized.includes(ULW_LOOP_DIR.toLowerCase()) ||
        normalized.includes(ULW_LOOP_GOALS.toLowerCase()) ||
        normalized.includes(ULW_LOOP_LEDGER.toLowerCase()));
}
export function textMentionsGoalId(value, goalId) {
    return (value ?? "").toLowerCase().includes(goalId.toLowerCase());
}
export function textHasCompletionValidationEvidence(value) {
    const normalized = (value ?? "").toLowerCase();
    const done = /\b(?:planned work|implementation|deliverables?|scope|task|work)\b/.test(normalized) &&
        /\b(?:done|complete|completed|finished|shipped)\b/.test(normalized);
    const verified = /\b(?:validation|verification|tests?|build|lint|review|quality gate|code-review)\b/.test(normalized) &&
        /\b(?:passed|complete|completed|clean|green|approve|approved|clear)\b/.test(normalized);
    return done && verified;
}
export async function snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope) {
    const actual = snapshotObjective.replace(/\s+/g, " ").trim().toLowerCase();
    if (textMentionsUlwLoopPlanArtifact(actual))
        return true;
    if (actual.length < 24 || !existsSync(ulwLoopBriefPath(repoRoot, scope)))
        return false;
    try {
        const brief = (await readFile(ulwLoopBriefPath(repoRoot, scope), "utf8"))
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
        return brief.length >= 24 && (brief.includes(actual) || actual.includes(brief));
    }
    catch {
        return false;
    }
}
export async function canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot, plan, goal, snapshotObjective, evidence, scope) {
    if (codexGoalMode(plan) !== "aggregate")
        return false;
    if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id)
        return false;
    if (isFinalRunCompletionCandidate(plan, goal))
        return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
    if (!textMentionsUlwLoopPlanArtifact(evidence) || !textMentionsGoalId(evidence, goal.id))
        return false;
    if (!textHasCompletionValidationEvidence(evidence))
        return false;
    return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
}
export async function canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot, plan, goal, snapshotObjective, evidence, scope) {
    if (codexGoalMode(plan) !== "aggregate")
        return false;
    if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id)
        return false;
    if (!isFinalRunCompletionCandidate(plan, goal))
        return false;
    if (!textHasCompletionValidationEvidence(evidence))
        return false;
    return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
}
export function buildCompletedLegacyGoalRemediation(goal) {
    return [
        "If get_goal returns a different completed legacy/thread objective, do not repeat --status complete in this thread.",
        `Record a non-terminal blocker with: omo ulw-loop checkpoint --goal-id ${goal.id} --status blocked --evidence "<completed legacy Codex goal blocks create_goal in this thread>" --codex-goal-json "<different completed get_goal JSON or path>".`,
        "Then continue only from a Codex goal context with no active/completed conflicting goal, in the same repo/worktree, and create the intended goal there.",
    ].join(" ");
}
export function buildTaskScopedAggregateReconciliationHint(goal, final) {
    if (final) {
        return ` Final task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress final OMO goal and the completed get_goal objective to map to the ulw-loop brief or artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
    }
    return ` Completed task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress OMO goal, evidence that names that active OMO goal id, names .omo/ulw-loop/goals.json or ledger.jsonl, includes completed implementation plus validation/review evidence, and a get_goal objective that maps to the ulw-loop brief/artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
}
export async function readJsonInput(raw, repoRoot) {
    if (raw === undefined || raw.trim() === "")
        return undefined;
    try {
        return JSON.parse(raw);
    }
    catch {
        const filePath = resolve(repoRoot, raw);
        if (existsSync(filePath)) {
            try {
                return JSON.parse(await readFile(filePath, "utf8"));
            }
            catch {
                return undefined;
            }
        }
        return undefined;
    }
}
export async function reconcileCheckpointSnapshot(repoRoot, plan, goal, evidence, now, args, scope) {
    const aggregate = codexGoalMode(plan) === "aggregate";
    const final = isFinalRunCompletionCandidate(plan, goal);
    const snapshot = await readCodexGoalSnapshotInput(args.codexGoalJson, repoRoot);
    const reconciliation = reconcileCodexGoalSnapshot(snapshot, {
        expectedObjective: expectedCodexObjective(plan, goal),
        ...(aggregate ? { acceptedObjectives: compatibleCodexObjectives(plan) } : {}),
        allowedStatuses: aggregate ? (final ? ["complete"] : ["active"]) : ["complete"],
        requireSnapshot: Boolean(args.codexGoalJson?.trim()),
        requireComplete: Boolean(args.codexGoalJson?.trim()) && (!aggregate || final),
    });
    const codexGoal = reconciliation.snapshot.raw;
    let aggregateCompletion;
    if (!reconciliation.ok) {
        const objective = snapshot?.objective;
        const mismatched = snapshot?.available === true &&
            objective !== undefined &&
            objective.replace(/\s+/g, " ").trim().toLowerCase() !==
                expectedCodexObjective(plan, goal).replace(/\s+/g, " ").trim().toLowerCase();
        const completedScoped = mismatched &&
            snapshot.status === "complete" &&
            (await canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope));
        const activeScoped = mismatched &&
            snapshot.status === "active" &&
            (await canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope));
        if (!completedScoped && !activeScoped) {
            throw new UlwLoopError(`${formatCodexGoalReconciliation(reconciliation)}${aggregate && snapshot?.status === "complete" && objective !== undefined ? buildTaskScopedAggregateReconciliationHint(goal, final) : ""}`, "ulw_loop_codex_snapshot_mismatch");
        }
        aggregateCompletion = makeAggregateCompletion(now, evidence, codexGoal);
    }
    if (final)
        aggregateCompletion = makeAggregateCompletion(now, evidence, codexGoal);
    const qualityGate = final || aggregateCompletion !== undefined
        ? validateQualityGate(await readJsonInput(args.qualityGateJson, repoRoot))
        : undefined;
    return {
        codexGoal,
        ...(aggregateCompletion !== undefined ? { aggregateCompletion } : {}),
        ...(qualityGate !== undefined ? { qualityGate } : {}),
    };
}
