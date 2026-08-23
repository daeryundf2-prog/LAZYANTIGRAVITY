/**
 * Human-In-The-Loop (HITL) Interactive Decision Bridge
 * Formats decision-complete payloads and resolves blocked workflows.
 */

import type { UlwLoopItem, UlwLoopPlan } from "./types.js";

export interface HitlOption {
	readonly id: "retry" | "override" | "abort";
	readonly label: string;
	readonly description: string;
}

export interface HitlDecisionCard {
	readonly goalId: string;
	readonly goalObjective: string;
	readonly blockerSignature: string;
	readonly occurrences: number;
	readonly rootReason: string;
	readonly availableOptions: readonly HitlOption[];
	readonly suggestedAction: "retry" | "override" | "abort";
}

export function buildHitlDecisionCard(goal: UlwLoopItem, reason: string): HitlDecisionCard {
	const blockerSignature = goal.blockerSignature || "consensus_conflict";
	const occurrences = goal.blockerOccurrenceCount || 3;

	const options: HitlOption[] = [
		{
			id: "retry",
			label: "수정 후 재시도 (Retry with fix)",
			description: "원인 분석 내용을 반영하여 새로운 증거로 품질 게이트를 다시 수행합니다.",
		},
		{
			id: "override",
			label: "예외 승인 (Approve Override)",
			description: "안전성 검토를 거쳐 관리자 권한으로 현재 상태를 완료로 강제 승인합니다.",
		},
		{
			id: "abort",
			label: "작업 중단 (Abort Goal)",
			description: "해당 목표의 실행을 즉시 중단하고 실패 상태로 기록합니다.",
		},
	];

	return {
		goalId: goal.id,
		goalObjective: goal.objective,
		blockerSignature,
		occurrences,
		rootReason: reason,
		availableOptions: options,
		suggestedAction: "retry",
	};
}

export function applyHitlDecision(
	plan: UlwLoopPlan,
	goalId: string,
	decision: "retry" | "override" | "abort",
	rationale?: string,
): UlwLoopItem {
	const goal = plan.goals.find((g) => g.id === goalId);
	if (!goal) {
		throw new Error(`Goal with id "${goalId}" not found in plan.`);
	}

	const now = new Date().toISOString();
	goal.updatedAt = now;

	if (decision === "retry") {
		goal.status = "in_progress";
		delete goal.blockedReason;
		delete goal.nonRetriable;
		plan.activeGoalId = goal.id;
	} else if (decision === "override") {
		goal.status = "complete";
		goal.completedAt = now;
		goal.evidence = rationale || "Manually approved via HITL decision override";
		delete goal.blockedReason;
		if (plan.activeGoalId === goal.id) delete plan.activeGoalId;
	} else if (decision === "abort") {
		goal.status = "failed";
		goal.failedAt = now;
		goal.failureReason = rationale || "Aborted by operator via HITL decision bridge";
		if (plan.activeGoalId === goal.id) delete plan.activeGoalId;
	}

	return goal;
}
