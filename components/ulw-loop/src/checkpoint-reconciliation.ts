import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { codexGoalMode, isFinalRunCompletionCandidate } from "./goal-status.js";
import { type UlwLoopScope, ulwLoopBriefPath } from "./paths.js";
import type { UlwLoopAggregateCompletion, UlwLoopItem, UlwLoopPlan, UlwLoopQualityGate } from "./types.js";
import { ULW_LOOP_DIR, ULW_LOOP_GOALS, ULW_LOOP_LEDGER, UlwLoopError } from "./types.js";

export function textMentionsUlwLoopPlanArtifact(value: string | undefined): boolean {
	const normalized = (value ?? "").toLowerCase();
	return normalized.includes(ULW_LOOP_DIR.toLowerCase()) || normalized.includes(ULW_LOOP_GOALS.toLowerCase()) || normalized.includes(ULW_LOOP_LEDGER.toLowerCase());
}

export function textMentionsGoalId(value: string | undefined, goalId: string): boolean {
	return (value ?? "").toLowerCase().includes(goalId.toLowerCase());
}

export function textHasCompletionValidationEvidence(value: string | undefined): boolean {
	const normalized = (value ?? "").toLowerCase();
	const done = /\b(?:planned work|implementation|deliverables?|scope|task|work)\b/.test(normalized) && /\b(?:done|complete|completed|finished|shipped)\b/.test(normalized);
	const verified = /\b(?:validation|verification|tests?|build|lint|review|quality gate|code-review)\b/.test(normalized) && /\b(?:passed|complete|completed|clean|green|approve|approved|clear)\b/.test(normalized);
	return done && verified;
}

export async function snapshotObjectiveMapsToUlwLoopPlan(repoRoot: string, snapshotObjective: string, scope?: UlwLoopScope): Promise<boolean> {
	const actual = snapshotObjective.replace(/\s+/g, " ").trim().toLowerCase();
	if (textMentionsUlwLoopPlanArtifact(actual)) return true;
	if (actual.length < 24 || !existsSync(ulwLoopBriefPath(repoRoot, scope))) return false;
	try {
		const brief = (await readFile(ulwLoopBriefPath(repoRoot, scope), "utf8")).replace(/\s+/g, " ").trim().toLowerCase();
		return brief.length >= 24 && (brief.includes(actual) || actual.includes(brief));
	} catch {
		return false;
	}
}

export async function canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot: string, plan: UlwLoopPlan, goal: UlwLoopItem, snapshotObjective: string, evidence: string, scope?: UlwLoopScope): Promise<boolean> {
	if (codexGoalMode(plan) !== "aggregate") return false;
	if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id) return false;
	if (isFinalRunCompletionCandidate(plan, goal)) return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
	if (!textMentionsUlwLoopPlanArtifact(evidence) || !textMentionsGoalId(evidence, goal.id)) return false;
	if (!textHasCompletionValidationEvidence(evidence)) return false;
	return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
}

export async function canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot: string, plan: UlwLoopPlan, goal: UlwLoopItem, snapshotObjective: string, evidence: string, scope?: UlwLoopScope): Promise<boolean> {
	if (codexGoalMode(plan) !== "aggregate") return false;
	if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id) return false;
	if (!isFinalRunCompletionCandidate(plan, goal)) return false;
	if (!textHasCompletionValidationEvidence(evidence)) return false;
	return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
}

export function buildCompletedLegacyGoalRemediation(goal: UlwLoopItem): string {
	return [
		"If get_goal returns a different completed legacy/thread objective, do not repeat --status complete in this thread.",
		`Record a non-terminal blocker with: omo ulw-loop checkpoint --goal-id ${goal.id} --status blocked --evidence "<completed legacy Codex goal blocks create_goal in this thread>" --codex-goal-json "<different completed get_goal JSON or path>".`,
		"Then continue only from a Codex goal context with no active/completed conflicting goal, in the same repo/worktree, and create the intended goal there.",
	].join(" ");
}

export function buildTaskScopedAggregateReconciliationHint(goal: UlwLoopItem, final: boolean): string {
	if (final) {
		return ` Final task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress final OMO goal and the completed get_goal objective to map to the ulw-loop brief or artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
	}
	return ` Completed task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress OMO goal, evidence that names that active OMO goal id, names .omo/ulw-loop/goals.json or ledger.jsonl, includes completed implementation plus validation/review evidence, and a get_goal objective that maps to the ulw-loop brief/artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
}

export async function readJsonInput(raw: string | undefined, repoRoot: string): Promise<unknown> {
	if (raw === undefined || raw.trim() === "") return undefined;
	const trimmed = raw.trim();
	try { return JSON.parse(trimmed); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
	const path = resolve(repoRoot, trimmed);
	if (!existsSync(path)) throw new UlwLoopError("Quality gate JSON is neither valid JSON nor a readable path.", "ulw_loop_json_input_invalid");
	try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { throw new UlwLoopError(`Quality gate path does not contain valid JSON${error instanceof Error ? `: ${error.message}` : "."}`, "ulw_loop_json_input_invalid"); }
}

export function makeAggregateCompletion(now: string, evidence: string, codexGoal: unknown): UlwLoopAggregateCompletion {
	return { status: "complete", completedAt: now, evidence, codexGoal };
}

export interface CheckpointQualityGateResult {
	readonly finalizerAllowed: boolean;
	readonly qualityGate?: UlwLoopQualityGate | undefined;
	readonly codexGoal?: unknown;
	readonly aggregateCompletion?: UlwLoopAggregateCompletion | undefined;
	readonly goalStatusOverride?: UlwLoopItem["status"] | undefined;
	readonly blockedReasonOverride?: string | undefined;
	readonly failedReasonOverride?: string | undefined;
}
