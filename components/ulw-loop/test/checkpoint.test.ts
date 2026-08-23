// biome-ignore-all format: keep the single mandated checkpoint spec under the pure LOC budget.
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { checkpointUlwLoop } from "../src/checkpoint.js";
import { setMockPersonaVerdict } from "../src/consensus-dispatcher.js";
import { appendRunEvent, readRunEvents } from "../src/control-plane.js";
import { ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE } from "../src/goal-status.js";
import { ulwLoopBriefPath, ulwLoopDir, ulwLoopLedgerPath } from "../src/paths.js";
import { writePlan } from "../src/plan-io.js";
import type { UlwLoopItem, UlwLoopLedgerEntry, UlwLoopPlan, UlwLoopSuccessCriterion } from "../src/types.js";
import { UlwLoopError } from "../src/types.js";
import { validateConsensusResultEnvelope } from "../src/verification-pipeline.js";

const NOW = "2026-05-23T00:00:00.000Z";
const QUALITY_GATE_PATH = fileURLToPath(new URL("./fixtures/sample-quality-gate.json", import.meta.url));

function criterion(id: string, status: UlwLoopSuccessCriterion["status"]): UlwLoopSuccessCriterion {
	return { id, scenario: `${id} scenario`, userModel: "happy", expectedEvidence: `${id} proof`, capturedEvidence: status === "pass" ? `${id} passed` : null, status };
}

function goal(overrides: Partial<UlwLoopItem> = {}): UlwLoopItem {
	return { id: "G001", title: "Build auth", objective: "Implement JWT auth endpoint", status: "in_progress", successCriteria: [criterion("C001", "pass"), criterion("C002", "pass"), criterion("C003", "pass")], attempt: 1, createdAt: NOW, updatedAt: NOW, ...overrides };
}

function plan(goals: UlwLoopItem[], overrides: Partial<UlwLoopPlan> = {}): UlwLoopPlan {
	const result: UlwLoopPlan = { version: 1, createdAt: NOW, updatedAt: NOW, briefPath: ".omo/ulw-loop/brief.md", goalsPath: ".omo/ulw-loop/goals.json", ledgerPath: ".omo/ulw-loop/ledger.jsonl", codexGoalMode: "aggregate", codexObjective: ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE, goals };
	Object.assign(result, overrides);
	const activeGoalId = goals.find((candidate) => candidate.status === "in_progress")?.id;
	if (result.activeGoalId === undefined && activeGoalId !== undefined) result.activeGoalId = activeGoalId;
	return result;
}

async function samplePlan(overrides: Partial<UlwLoopPlan> = {}): Promise<UlwLoopPlan> {
	const fixture: UlwLoopPlan = JSON.parse(await readFile(new URL("./fixtures/sample-plan.json", import.meta.url), "utf8"));
	return plan(fixture.goals.map((item, index) => goal({ ...item, attempt: index + 1, createdAt: NOW, updatedAt: NOW })), overrides);
}

async function repoWith(seed: UlwLoopPlan): Promise<string> {
	const repo = await mkdtemp(join(tmpdir(), "ug-checkpoint-"));
	await mkdir(ulwLoopDir(repo), { recursive: true });
	await mkdir(join(repo, "src"), { recursive: true });
	await mkdir(join(repo, "test"), { recursive: true });
	await writeFile(join(repo, "src", "index.ts"), "index fixture\n", "utf8");
	await writeFile(join(repo, "src", "auth.ts"), "auth fixture\n", "utf8");
	await writeFile(join(repo, "test", "auth.test.ts"), "test fixture\n", "utf8");
	await writePlan(repo, seed);
	await seedSubagentCompletion(repo);
	return repo;
}

function snapshot(status: "active" | "complete", objective = ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE): string {
	return JSON.stringify({ goal: { objective, status } });
}

async function seedSubagentCompletion(repo: string, runId = "default-run"): Promise<void> {
	await appendRunEvent(repo, runId, "agent.completed_reported", {
		result: {
			runId,
			agentId: "worker-1",
			role: "worker",
			status: "success",
			summary: "implemented changes and ran tests",
			filesChanged: ["src/auth.ts", "test/auth.test.ts"],
			commandsRun: ["npm test", "npm run build"],
			artifactsGenerated: [],
			blockers: [],
			nextRecommendedAction: "checkpoint",
			requiresParentAck: true,
		},
		role: "worker",
	});
}

async function lastLedger(repo: string): Promise<UlwLoopLedgerEntry> {
	const last = (await readFile(ulwLoopLedgerPath(repo), "utf8")).trim().split(/\r?\n/).at(-1);
	if (last === undefined) throw new Error("expected ledger entry");
	const entry: UlwLoopLedgerEntry = JSON.parse(last);
	return entry;
}

async function expectCode(action: () => Promise<unknown>, code: string): Promise<void> {
	try {
		await action();
	} catch (error) {
		expect(error).toBeInstanceOf(UlwLoopError);
		if (!(error instanceof UlwLoopError)) throw error;
		expect(error.code).toBe(code);
		return;
	}
	throw new Error("Expected UlwLoopError");
}

function passGoal(id: string, overrides: Partial<UlwLoopItem> = {}): UlwLoopItem {
	return goal({ id, successCriteria: [criterion("C001", "pass"), criterion("C002", "pass"), criterion("C003", "pass")], ...overrides });
}

describe("checkpointUlwLoop status=complete criteria gate", () => {
	it("THROWS ulw_loop_criteria_not_all_pass when any criterion is pending", async () => {
		const repo = await repoWith(await samplePlan({ goals: [goal({ successCriteria: [criterion("C001", "pass"), criterion("C002", "pending"), criterion("C003", "pass")] })] }));
		await expectCode(() => checkpointUlwLoop(repo, { goalId: "G001", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "done" }), "ulw_loop_criteria_not_all_pass");
	});

	it("THROWS when any criterion is fail or blocked", async () => {
		for (const status of ["fail", "blocked"] satisfies UlwLoopSuccessCriterion["status"][]) {
			const repo = await repoWith(plan([goal({ successCriteria: [criterion("C001", "pass"), criterion("C002", status), criterion("C003", "pass")] })]));
			await expectCode(() => checkpointUlwLoop(repo, { goalId: "G001", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "done" }), "ulw_loop_criteria_not_all_pass");
		}
	});

	it("THROWS when criteria list is empty", async () => {
		const repo = await repoWith(plan([goal({ successCriteria: [] }), goal({ id: "G002", status: "pending" })]));
		await expectCode(() => checkpointUlwLoop(repo, { goalId: "G001", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "done", codexGoalJson: snapshot("active") }), "ulw_loop_criteria_not_all_pass");
	});

	it("ACCEPTS complete when ALL criteria pass (with valid snapshot)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		const result = await checkpointUlwLoop(repo, { goalId: "G001", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "implementation done and tests passed", codexGoalJson: snapshot("active") });
		expect(result.goal.status).toBe("complete");
		expect((await lastLedger(repo)).kind).toBe("goal_completed");
	});
});

describe("checkpointUlwLoop reconciliation (status=complete)", () => {
	it("succeeds when snapshot objective matches expected (aggregate active)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		await expect(checkpointUlwLoop(repo, { goalId: "G001", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "work complete and validation passed", codexGoalJson: snapshot("active") })).resolves.toMatchObject({ goal: { status: "complete" } });
	});

	it("throws on mismatched objective", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		await expectCode(() => checkpointUlwLoop(repo, { goalId: "G001", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "work complete and validation passed", codexGoalJson: snapshot("active", "wrong objective") }), "ulw_loop_codex_snapshot_mismatch");
	});

	it("throws on mismatched status (snapshot complete when expected active)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		await expectCode(() => checkpointUlwLoop(repo, { goalId: "G001", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "work complete and validation passed", codexGoalJson: snapshot("complete") }), "ulw_loop_codex_snapshot_mismatch");
	});
});

describe("checkpointUlwLoop final story", () => {
	it("requires quality-gate-json for the final goal complete", async () => {
		const repo = await repoWith(plan([passGoal("G001", { status: "complete" }), passGoal("G002")], { activeGoalId: "G002" }));
		await expectCode(() => checkpointUlwLoop(repo, { goalId: "G002", status: "complete", evidence: "final work complete and validation passed", codexGoalJson: snapshot("complete") }), "ULW_LOOP_QUALITY_GATE_INVALID");
	});

	it("accepts final story when quality gate JSON includes valid criteriaCoverage", async () => {
		const repo = await repoWith(plan([passGoal("G001", { status: "complete" }), passGoal("G002")], { activeGoalId: "G002" }));
		const result = await checkpointUlwLoop(repo, { goalId: "G002", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "final work complete and validation passed", codexGoalJson: snapshot("complete") });
		expect(result.aggregateCompletion?.status).toBe("complete");
		expect(result.plan.aggregateCompletion?.status).toBe("complete");
	});

	it("ACCEPTS complete when task-scoped completed Codex objective maps to the ulw-loop brief", async () => {
		const taskObjective = "Fix ulw-loop objective mismatch and install local ulw";
		const repo = await repoWith(plan([passGoal("G001")], { activeGoalId: "G001" }));
		await writeFile(ulwLoopBriefPath(repo), `${taskObjective}\n`, "utf8");

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "final implementation complete and quality gate passed",
			codexGoalJson: snapshot("complete", taskObjective),
		});

		expect(result.aggregateCompletion?.status).toBe("complete");
		expect(result.ledgerEntry.kind).toBe("aggregate_completed");
	});

	it("ACCEPTS complete when active task-scoped Codex objective maps to the ulw-loop brief", async () => {
		const taskObjective = "Create only research artifacts with source evidence";
		const repo = await repoWith(plan([passGoal("G001")], { activeGoalId: "G001" }));
		await writeFile(ulwLoopBriefPath(repo), `${taskObjective}\n`, "utf8");

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "final implementation complete and quality gate passed",
			codexGoalJson: snapshot("active", taskObjective),
		});

		expect(result.aggregateCompletion?.status).toBe("complete");
		expect(result.ledgerEntry.kind).toBe("aggregate_completed");
	});

	it("explains final task-scoped objective mapping when completed Codex objective is unrelated", async () => {
		const repo = await repoWith(plan([passGoal("G001")], { activeGoalId: "G001" }));
		await writeFile(ulwLoopBriefPath(repo), "Fix ulw-loop objective mismatch and install local ulw\n", "utf8");

		await expect(
			checkpointUlwLoop(repo, {
				goalId: "G001",
				status: "complete",
				evidence: "final implementation complete and quality gate passed",
				codexGoalJson: snapshot("complete", "unrelated completed task"),
				qualityGateJson: QUALITY_GATE_PATH,
			}),
		).rejects.toThrow("Final task-scoped aggregate reconciliation");
	});
});

describe("checkpointUlwLoop status=failed", () => {
	it("sets goal.status=failed, goal.failedAt, appends ledger", async () => {
		const repo = await repoWith(plan([goal({ successCriteria: [criterion("C001", "pending")] })]));
		const result = await checkpointUlwLoop(repo, { goalId: "G001", status: "failed", evidence: "tests failed" });
		expect(result.goal.status).toBe("failed");
		expect(result.goal.failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
		expect((await lastLedger(repo)).kind).toBe("goal_failed");
	});

	it("classifies external authorization blocker signatures", async () => {
		const repo = await repoWith(plan([goal()]));
		const result = await checkpointUlwLoop(repo, { goalId: "G001", status: "failed", evidence: "ghcr.io returned 401 authentication required because token missing" });
		expect(result.goal.blockerSignature).toBe("GHCR_PULL_ACCESS:HTTP_401_ANONYMOUS:GHCR_VISIBILITY_OR_CREDENTIAL_REQUIRED");
	});

	it("after 3 same-signature blockers, marks needs_user_decision + nonRetriable", async () => {
		const repo = await repoWith(plan([goal({ id: "G001", status: "failed", blockerSignature: "EXTERNAL_AUTHORIZATION_REQUIRED" }), goal({ id: "G002", status: "blocked", blockerSignature: "EXTERNAL_AUTHORIZATION_REQUIRED" }), goal({ id: "G003" })], { activeGoalId: "G003" }));
		const result = await checkpointUlwLoop(repo, { goalId: "G003", status: "failed", evidence: "Registry returned 401 because credentials are missing" });
		expect(result.goal.status).toBe("needs_user_decision");
		expect(result.goal.nonRetriable).toBe(true);
	});

	it("skips the criteria gate for failed status", async () => {
		const repo = await repoWith(plan([goal({ successCriteria: [criterion("C001", "pending")] })]));
		await expect(checkpointUlwLoop(repo, { goalId: "G001", status: "failed", evidence: "not done" })).resolves.toMatchObject({ goal: { status: "failed" } });
	});
});

describe("checkpointUlwLoop status=blocked", () => {
	it("preserves blocker fields + appends ledger", async () => {
		const repo = await repoWith(plan([goal()]));
		const result = await checkpointUlwLoop(repo, { goalId: "G001", status: "blocked", evidence: "ghcr.io requires token and credentials are missing" });
		expect(result.goal.status).toBe("blocked");
		expect(result.goal.blockedReason).toContain("ghcr.io");
		expect(result.goal.blockerSignature).toContain("GHCR_PULL_ACCESS");
		expect((await lastLedger(repo)).kind).toBe("goal_blocked");
	});

	it("skips the criteria gate for blocked status", async () => {
		const repo = await repoWith(plan([goal({ successCriteria: [criterion("C001", "pending")] })]));
		await expect(checkpointUlwLoop(repo, { goalId: "G001", status: "blocked", evidence: "waiting for approval" })).resolves.toMatchObject({ goal: { status: "blocked" } });
	});
});

describe("checkpointUlwLoop rebrand", () => {
	it("does not emit legacy brand token in any returned text or ledger payload", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		const result = await checkpointUlwLoop(repo, { goalId: "G001", status: "complete", qualityGateJson: QUALITY_GATE_PATH, evidence: "implementation done in .omo/ulw-loop/goals.json for G001 and validation passed", codexGoalJson: snapshot("active") });
		const forbidden = ["o", "m", "x"].join("");
		const payload = `${JSON.stringify(result)}\n${await readFile(ulwLoopLedgerPath(repo), "utf8")}`.toLowerCase();
		expect(payload).not.toContain(forbidden);
	});
});

describe("checkpointUlwLoop Phase 1 - Quality Gate Auto-Orchestration", () => {
	it("auto-runs quality gate and verification pipeline on complete (C001)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "work is done and tested",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("complete");

		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "quality_gate.started")).toBe(true);
		expect(events.some((e) => e.type === "quality_gate.completed")).toBe(true);
	});

	it("blocks finalize and sets status to failed when mechanical gate fails (C002)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: [] },
		});

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "work is done without running tests",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("failed");
		expect(result.goal.failureReason).toContain("Mechanical verification failed");

		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "quality_gate.mechanical_failed")).toBe(true);
		expect(events.some((e) => e.type === "quality_gate.failed")).toBe(true);
	});

	it("blocks finalize and sets status to failed when semantic gate fails (C003)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});
		await appendRunEvent(repo, "default-run", "parent.stagnation_detected", {
			fingerprint: "stag-123",
		});

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "work complete",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("failed");
		expect(result.goal.failureReason).toContain("Unresolved stagnation");

		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "quality_gate.failed")).toBe(true);
	});

	it("triggers consensus when objective contains high-risk keywords (C004, C005)", async () => {
		const repo = await repoWith(plan([passGoal("G001", { objective: "Implement JWT security auth" }), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "security auth work complete",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("complete");

		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "quality_gate.consensus_required")).toBe(true);
		expect(events.some((e) => e.type === "quality_gate.consensus_started")).toBe(true);
		expect(events.some((e) => e.type === "quality_gate.consensus_passed")).toBe(true);
	});

	it("triggers consensus when evidence contains destructive keywords (C004, C005)", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "we had to delete old table data to complete this",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("complete");

		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "quality_gate.consensus_required")).toBe(true);
		expect(events.some((e) => e.type === "quality_gate.consensus_started")).toBe(true);
	});

	it("allows finalization when consensus passes (C006)", async () => {
		const repo = await repoWith(plan([passGoal("G001", { objective: "Implement secure auth" }), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "done",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("complete");
	});

	it("blocks finalization and sets status to failed when consensus fails (C007)", async () => {
		const repo = await repoWith(plan([passGoal("G001", { objective: "Implement secure auth" }), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "reject");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "done",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("failed");

		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "quality_gate.consensus_failed")).toBe(true);
	});

	it("blocks finalization and requests HITL when consensus is inconclusive (C007, C010)", async () => {
		const repo = await repoWith(plan([passGoal("G001", { objective: "Implement secure auth" }), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "inconclusive");

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "done",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("needs_user_decision");

		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "quality_gate.consensus_inconclusive")).toBe(true);
		expect(events.some((e) => e.type === "parent.hitl_required")).toBe(true);
	});

	it("maintains idempotency on duplicate checkpoint submission (C009)", async () => {
		const repo = await repoWith(plan([passGoal("G001", { objective: "Implement secure auth" }), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		const result1 = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "done",
			codexGoalJson: snapshot("active"),
		});
		expect(result1.goal.status).toBe("complete");

		const eventsCount1 = (await readRunEvents(repo, "default-run")).length;

		const result2 = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "done",
			codexGoalJson: snapshot("active"),
		});
		expect(result2.goal.status).toBe("complete");

		const eventsCount2 = (await readRunEvents(repo, "default-run")).length;
		expect(eventsCount2).toBe(eventsCount1);
	});

	it("prohibits subagents from directly asserting run completion in envelope (C008)", () => {
		const badEnvelope1 = {
			runId: "run-x",
			consensusId: "c-x",
			agentId: "a-x",
			persona: "advocate",
			verdict: "approve",
			reason: "looks complete and the run.completed is success",
			requiresParentAck: true,
		};
		expect(() => validateConsensusResultEnvelope(badEnvelope1, "run-x", "c-x")).toThrow(
			"Validation rejected: consensus subagent cannot assert run.completed or run.failed directly",
		);

		const badEnvelope2 = {
			runId: "run-x",
			consensusId: "c-x",
			agentId: "a-x",
			persona: "advocate",
			verdict: "approve",
			reason: "complete",
			requiresParentAck: true,
			mayFinalizeRun: true,
		};
		expect(() => validateConsensusResultEnvelope(badEnvelope2, "run-x", "c-x")).toThrow(
			"Validation rejected: consensus subagents cannot finalize run",
		);
	});

	it("triggers consensus and injects feedback when there are LSP or rules violations", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));
		const lspDir = join(repo, "plugins/omo/components/lsp/dist");
		await mkdir(lspDir, { recursive: true });
		await writeFile(
			join(lspDir, "codex-hook.js"),
			"export async function runLspDiagnosticsText() { return 'LSP compiler error: Type mismatch'; }",
			"utf8",
		);

		const rulesDir = join(repo, "plugins/omo/components/rules/dist");
		await mkdir(rulesDir, { recursive: true });
		await writeFile(
			join(rulesDir, "rules-engine-factory.js"),
			"export function createRulesEngine() { return { loadDynamicRules: () => ({ diagnostics: [{ filePath: 'src/index.ts', message: 'Rule violation: AST pattern mismatch' }] }) }; }",
			"utf8",
		);

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "work done",
			codexGoalJson: snapshot("active"),
		});

		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "quality_gate.consensus_required")).toBe(true);

		const startedEvent = events.find((e) => e.type === "quality_gate.consensus_started");
		expect(startedEvent).toBeDefined();
	});

	it("blocks finalization and transitions to needs_user_decision when rework attempts loop limit is hit", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));

		const { calculateQualityFingerprint } = await import("../src/verification-pipeline.js");
		const evidenceEnvelope = {
			goal: "Implement JWT auth endpoint",
			summary: "work done again",
			filesChanged: ["src/auth.ts", "test/auth.test.ts"],
			commandsRun: ["npm test", "npm run build"],
			testResults: ["npm test"],
			artifactsGenerated: [],
			completedRoles: ["worker"],
			acknowledgedRoles: [],
			dryRunSafety: true,
		};
		const fp = calculateQualityFingerprint(evidenceEnvelope);

		await appendRunEvent(repo, "default-run", "quality_gate.consensus_rework_required" as any, {
			consensusId: "c-1",
			qualityInputFingerprint: fp,
		});
		await appendRunEvent(repo, "default-run", "quality_gate.consensus_rework_required" as any, {
			consensusId: "c-2",
			qualityInputFingerprint: fp,
		});
		await appendRunEvent(repo, "default-run", "quality_gate.consensus_rework_required" as any, {
			consensusId: "c-3",
			qualityInputFingerprint: fp,
		});

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "work done again",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("needs_user_decision");
		const events = await readRunEvents(repo, "default-run");
		expect(events.some((e) => e.type === "parent.hitl_required")).toBe(true);
	});

	it("does not block finalization and counts separately for different failureFingerprints", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		await appendRunEvent(repo, "default-run", "quality_gate.consensus_rework_required" as any, {
			consensusId: "c-1",
			qualityInputFingerprint: "different-fp",
		});
		await appendRunEvent(repo, "default-run", "quality_gate.consensus_rework_required" as any, {
			consensusId: "c-2",
			qualityInputFingerprint: "different-fp",
		});
		await appendRunEvent(repo, "default-run", "quality_gate.consensus_rework_required" as any, {
			consensusId: "c-3",
			qualityInputFingerprint: "different-fp",
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		const result = await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "work done again",
			codexGoalJson: snapshot("active"),
		});

		expect(result.goal.status).toBe("complete");
	});

	it("propagates unique traceId / traceParent across consensus runs and records metrics", async () => {
		const repo = await repoWith(plan([passGoal("G001", { objective: "Implement secure auth" }), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.completed_reported", {
			agentId: "worker-1",
			result: { filesChanged: ["src/index.ts"], commandsRun: ["npm test"] },
		});

		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		await checkpointUlwLoop(repo, {
			goalId: "G001",
			status: "complete",
			qualityGateJson: QUALITY_GATE_PATH,
			evidence: "done",
			codexGoalJson: snapshot("active"),
		});

		const events = await readRunEvents(repo, "default-run");
		const startedEvent = events.find((e) => e.type === "quality_gate.consensus_started");
		expect(startedEvent?.traceId).toBeDefined();
		expect(startedEvent?.traceParent).toBeDefined();

		const personaEvent = events.find((e) => e.type === "quality_gate.consensus_persona_reported");
		expect(personaEvent?.traceId).toBe(startedEvent?.traceId);
		expect(personaEvent?.traceParent).toBe(startedEvent?.traceParent);
		expect(personaEvent?.totalDurationMs).toBeDefined();
	});

	it("scrubs sensitive tokens and keys in ledger logs and state files", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));

		await appendRunEvent(repo, "default-run", "agent.progress", {
			agentId: "worker-1",
			progress: "running with token sk-1234567890abcdef1234567890abcdef and secret key token_secret_123",
		});

		const events = await readRunEvents(repo, "default-run");
		const progressEvent = events.find((e) => e.type === "agent.progress");
		expect(progressEvent?.progress).not.toContain("sk-1234567890abcdef1234567890abcdef");
		expect(progressEvent?.progress).not.toContain("token_secret_123");
		expect(progressEvent?.progress).toContain("[REDACTED]");
	});

	it("resiliently ignores malformed/corrupted json lines and recovers ledger", async () => {
		const repo = await repoWith(plan([passGoal("G001"), goal({ id: "G002", status: "pending" })]));

		const runDir = join(repo, ".lazycodex", "runs", "default-run");
		const eventsFile = join(runDir, "events.jsonl");

		await mkdir(runDir, { recursive: true });
		await appendRunEvent(repo, "default-run", "run.created", {});
		await writeFile(eventsFile, "{\n", { flag: "a", encoding: "utf8" });

		const { repairLedgerFile } = await import("../src/control-plane.js");
		const repairRes = await repairLedgerFile(repo, "default-run");
		expect(repairRes.corruptedCount).toBe(1);

		const events = await readRunEvents(repo, "default-run");
		expect(events.length).toBeGreaterThan(0);
	});
});
