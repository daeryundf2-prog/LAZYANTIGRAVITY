import type { UlwLoopPlan } from "./types.js";

/**
 * Renders an immutable <session-goal> anchor block to survive context compaction
 * and prevent goal drift across long-running turns (PR #7238).
 */
export function renderSessionGoalAnchor(plan: UlwLoopPlan): string {
	const objective = plan.originalObjective || plan.briefPath || "Unspecified goal";
	const deliverables = plan.deliverables || plan.goals.map((g) => g.title);
	const items = deliverables.map((d) => {
		const match = findGoalForDeliverable(plan.goals, d);
		const mark = match?.status === "complete" ? "[x]" : "[ ]";
		return `- ${mark} ${d}`;
	});

	return [
		"<session-goal>",
		`Original Objective: ${objective}`,
		"Deliverables:",
		...items,
		`Status: ${plan.aggregateCompletion?.status === "complete" ? "completed" : "in_progress"}`,
		"</session-goal>",
	].join("\n");
}

/**
 * Deliverable-to-goal matching tolerant to whitespace/punctuation drift.
 * Exact-title match first, then a normalized comparison (case-folded,
 * whitespace collapsed, punctuation stripped) so a deliverable phrased
 * slightly differently from the goal title still renders its check state
 * instead of silently defaulting to "[ ]".
 */
function findGoalForDeliverable(goals: readonly UlwLoopPlan["goals"][number][], deliverable: string) {
	const exact = goals.find((g) => g.title === deliverable);
	if (exact !== undefined) return exact;
	const normDeliverable = normalizeAnchorText(deliverable);
	return goals.find((g) => normalizeAnchorText(g.title) === normDeliverable);
}

function normalizeAnchorText(value: string): string {
	return value
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/[.,;:!?"'`()\[\]{}·、。？！「」『』]/g, "")
		.trim();
}
