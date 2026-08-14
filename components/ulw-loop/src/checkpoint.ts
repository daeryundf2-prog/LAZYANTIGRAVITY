// biome-ignore-all format: keep checkpoint orchestration below the pure LOC budget.

import { runCheckpointQualityGate } from "./checkpoint-verification.js";
import { requireAllCriteriaPass } from "./evidence.js";
import type { UlwLoopScope } from "./paths.js";
import { appendLedger, readUlwLoopPlan, withUlwLoopMutationLock, writePlan } from "./plan-io.js";
import { classifyExternalAuthorizationBlocker, clearGoalBlockerFields, sameBlockerOccurrences } from "./quality-gate.js";
import type { UlwLoopAggregateCompletion, UlwLoopItem, UlwLoopLedgerEntry, UlwLoopPlan, UlwLoopQualityGate } from "./types.js";
import { iso, UlwLoopError } from "./types.js";

export interface CheckpointUlwLoopArgs { readonly goalId: string; readonly status: "complete" | "failed" | "blocked"; readonly evidence: string; readonly codexGoalJson?: string; readonly qualityGateJson?: string }
export interface CheckpointUlwLoopResult { readonly plan: UlwLoopPlan; readonly goal: UlwLoopItem; readonly ledgerEntry: UlwLoopLedgerEntry; readonly aggregateCompletion?: UlwLoopAggregateCompletion }

function ulwLoopFail(message: string, code: string): never { throw new UlwLoopError(message, code); }
function nonEmptyEvidence(value: string): string { const trimmed = value.trim(); return trimmed || ulwLoopFail("Evidence must be a non-empty string.", "ulw_loop_evidence_required"); }
function findGoal(plan: UlwLoopPlan, goalId: string): UlwLoopItem { const goal = plan.goals.find((candidate) => candidate.id === goalId); return goal ?? ulwLoopFail(`Unknown ulw-loop id: ${goalId}.`, "ulw_loop_goal_not_found"); }

function applyBlockedOrFailed(goal: UlwLoopItem, plan: UlwLoopPlan, status: "failed" | "blocked", evidence: string, now: string): void {
	const signature = classifyExternalAuthorizationBlocker(evidence);
	const occurrences = signature === null ? 0 : sameBlockerOccurrences(plan, signature) + 1;
	const needsDecision = signature !== null && occurrences >= 3;
	goal.status = needsDecision ? "needs_user_decision" : status;
	goal.updatedAt = now;
	if (status === "failed" || needsDecision) { goal.failedAt = now; goal.failureReason = evidence; }
	if (status === "blocked" || needsDecision) goal.blockedReason = evidence;
	if (signature !== null) { goal.blockerSignature = signature; goal.blockerOccurrenceCount = occurrences; goal.requiredExternalDecision = `Resolve external authorization: ${signature}`; }
	if (needsDecision) goal.nonRetriable = true;
	if (plan.activeGoalId === goal.id) delete plan.activeGoalId;
}

function ledgerKind(status: CheckpointUlwLoopArgs["status"], goal: UlwLoopItem, aggregateCompletion: UlwLoopAggregateCompletion | undefined): UlwLoopLedgerEntry["kind"] {
	if (aggregateCompletion !== undefined) return "aggregate_completed";
	if (status === "complete") return "goal_completed";
	if (goal.status === "needs_user_decision") return "goal_needs_user_decision";
	return status === "blocked" ? "goal_blocked" : "goal_failed";
}

function buildLedger(now: string, args: CheckpointUlwLoopArgs, goal: UlwLoopItem, qualityGate: UlwLoopQualityGate | undefined, codexGoal: unknown, aggregateCompletion: UlwLoopAggregateCompletion | undefined): UlwLoopLedgerEntry {
	const entry: UlwLoopLedgerEntry = { at: now, kind: ledgerKind(args.status, goal, aggregateCompletion), goalId: goal.id, status: goal.status, evidence: args.evidence };
	if (codexGoal !== undefined) entry.codexGoal = codexGoal;
	if (qualityGate !== undefined) entry.qualityGate = qualityGate;
	if (goal.blockerSignature !== undefined) entry.blockerSignature = goal.blockerSignature;
	if (goal.blockerOccurrenceCount !== undefined) entry.blockerOccurrenceCount = goal.blockerOccurrenceCount;
	if (goal.requiredExternalDecision !== undefined) entry.requiredExternalDecision = goal.requiredExternalDecision;
	return entry;
}

export async function checkpointUlwLoop(repoRoot: string, args: CheckpointUlwLoopArgs, scope?: UlwLoopScope): Promise<CheckpointUlwLoopResult> {
	return withUlwLoopMutationLock(repoRoot, scope, async () => {
		const plan = await readUlwLoopPlan(repoRoot, scope);
		const goal = findGoal(plan, args.goalId);
		if (args.status === "complete") requireAllCriteriaPass(goal);
		const evidence = nonEmptyEvidence(args.evidence);
		const now = iso();
		let aggregateCompletion: UlwLoopAggregateCompletion | undefined;
		let qualityGate: UlwLoopQualityGate | undefined;
		let codexGoal: unknown;

		if (args.status === "complete") {
			const gateResult = await runCheckpointQualityGate(repoRoot, goal, plan, evidence, args, now, scope);

			if (gateResult.finalizerAllowed) {
				qualityGate = gateResult.qualityGate;
				codexGoal = gateResult.codexGoal;
				aggregateCompletion = gateResult.aggregateCompletion;

				goal.status = "complete";
				goal.completedAt = now;
				goal.evidence = evidence;
				delete goal.failedAt;
				delete goal.failureReason;
				clearGoalBlockerFields(goal);
				if (plan.activeGoalId === goal.id) delete plan.activeGoalId;
			} else {
				if (gateResult.goalStatusOverride) {
					goal.status = gateResult.goalStatusOverride;
				}
				if (gateResult.blockedReasonOverride) {
					goal.blockedReason = gateResult.blockedReasonOverride;
				}
				if (gateResult.failedReasonOverride) {
					goal.failedAt = now;
					goal.failureReason = gateResult.failedReasonOverride;
				}
				if (plan.activeGoalId === goal.id && goal.status !== "in_progress") {
					delete plan.activeGoalId;
				}
			}
		} else {
			applyBlockedOrFailed(goal, plan, args.status, evidence, now);
		}

		goal.updatedAt = now;
		if (aggregateCompletion !== undefined) plan.aggregateCompletion = aggregateCompletion;
		plan.updatedAt = now;
		await writePlan(repoRoot, plan, scope);
		const ledgerEntry = buildLedger(now, args, goal, qualityGate, codexGoal, aggregateCompletion);
		await appendLedger(repoRoot, ledgerEntry, scope);
		return aggregateCompletion === undefined ? { plan, goal, ledgerEntry } : { plan, goal, ledgerEntry, aggregateCompletion };
	});
}
