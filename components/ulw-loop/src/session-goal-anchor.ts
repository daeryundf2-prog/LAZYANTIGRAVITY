import type { UlwLoopPlan } from "./types.js";

/**
 * Renders an immutable <session-goal> anchor block to survive context compaction
 * and prevent goal drift across long-running turns (PR #7238).
 */
export function renderSessionGoalAnchor(plan: UlwLoopPlan): string {
	const objective = plan.originalObjective || plan.briefPath || "Unspecified goal";
	const deliverables = plan.deliverables || plan.goals.map((g) => g.title);
	const items = deliverables.map((d) => {
		const match = plan.goals.find((g) => g.title === d);
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
