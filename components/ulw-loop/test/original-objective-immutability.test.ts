import { describe, expect, it } from "vitest";
import { renderSessionGoalAnchor } from "../src/session-goal-anchor.js";
import type { UlwLoopPlan } from "../src/types.js";

describe("originalObjective and deliverables immutability", () => {
	it("#given plan with originalObjective and deliverables #when session-goal anchor is rendered #then outputs structured block", () => {
		const plan: UlwLoopPlan = {
			version: 1,
			createdAt: "2026-09-10T06:00:00.000Z",
			updatedAt: "2026-09-10T06:00:00.000Z",
			briefPath: ".omo/ulw-loop/brief.md",
			goalsPath: ".omo/ulw-loop/goals.json",
			ledgerPath: ".omo/ulw-loop/ledger.jsonl",
			originalObjective: "Build authentication and dashboard features",
			deliverables: ["Auth Token Module", "User Dashboard UI"],
			goals: [
				{
					id: "G001",
					title: "Auth Token Module",
					objective: "Build JWT token module",
					status: "complete",
					successCriteria: [],
					attempt: 1,
					createdAt: "2026-09-10T06:00:00.000Z",
					updatedAt: "2026-09-10T06:05:00.000Z",
				},
				{
					id: "G002",
					title: "User Dashboard UI",
					objective: "Build React dashboard",
					status: "pending",
					successCriteria: [],
					attempt: 0,
					createdAt: "2026-09-10T06:00:00.000Z",
					updatedAt: "2026-09-10T06:00:00.000Z",
				},
			],
		};

		const rendered = renderSessionGoalAnchor(plan);
		expect(rendered).toContain("<session-goal>");
		expect(rendered).toContain("Original Objective: Build authentication and dashboard features");
		expect(rendered).toContain("- [x] Auth Token Module");
		expect(rendered).toContain("- [ ] User Dashboard UI");
		expect(rendered).toContain("Status: in_progress");
		expect(rendered).toContain("</session-goal>");
	});
});
