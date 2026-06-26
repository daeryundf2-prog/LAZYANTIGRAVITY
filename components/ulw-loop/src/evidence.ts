import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { essentialCriteriaOf, hasAllCriteriaPass, hasEssentialCriteriaPass } from "./goal-status.js";
import type { UlwLoopScope } from "./paths.js";
import { appendLedger, readUlwLoopPlan, withUlwLoopMutationLock, writePlan } from "./plan-io.js";
import type { UlwLoopItem, UlwLoopLedgerEntry, UlwLoopPlan, UlwLoopSuccessCriterion } from "./types.js";
import { iso, UlwLoopError } from "./types.js";

type EvidenceStatus = "pass" | "fail" | "blocked";
type RecordEvidenceArgs = {
	readonly goalId: string;
	readonly criterionId: string;
	readonly status: EvidenceStatus;
	readonly evidence: string;
	readonly notes?: string;
};

function verifyPhysicalEvidence(repoRoot: string, evidenceStr: string): void {
	// 1. Check for physical files in .omo/evidence/ or .omx/evidence/ in the evidence string
	const evidenceFileRegex = /(?:\.omo\/evidence\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+|\.omx\/evidence\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)/g;
	const matches = evidenceStr.match(evidenceFileRegex) || [];

	if (matches.length === 0) {
		throw new UlwLoopError(
			"Always-Grounded Verification: Your evidence must specify a physical artifact path under .omo/evidence/ or .omx/evidence/ (e.g. EVIDENCE_RECORDED: .omo/evidence/...). Plain text descriptions are not accepted.",
			"ulw_loop_verification_missing_physical_file"
		);
	}

	// 2. Physically check if each referenced file exists and is non-empty
	for (const match of matches) {
		const absolutePath = resolve(repoRoot, match);
		if (!existsSync(absolutePath)) {
			throw new UlwLoopError(
				`Always-Grounded Verification: The specified evidence file "${match}" does not exist on disk. You must perform the verification and save the output to this file first.`,
				"ulw_loop_verification_file_not_found"
			);
		}
		const stat = statSync(absolutePath);
		if (stat.size <= 0) {
			throw new UlwLoopError(
				`Always-Grounded Verification: The specified evidence file "${match}" is empty. Verification files must contain non-empty output logs/reports.`,
				"ulw_loop_verification_file_empty"
			);
		}
	}

	// 3. If code changes occurred, verify that the evidence content or the file contents contain a test run indicator showing tests passed.
	let gitStatus = "";
	try {
		gitStatus = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" }).trim();
	} catch {
		// Ignore git failures (e.g. not a git repo)
	}

	if (gitStatus) {
		const modifiedSourceFiles = gitStatus
			.split("\n")
			.map(line => line.trim().slice(3).trim())
			.filter(file => {
				const ext = file.split(".").pop();
				const isSource = ["ts", "tsx", "go", "py", "rs"].includes(ext);
				// Exclude tests, configs, .omo, .omx, node_modules, etc.
				const isNotTestOrConfig = !file.includes("test/") && 
				                          !file.includes("tests/") && 
				                          !file.includes(".test.") &&
				                          !file.includes(".spec.") &&
				                          !file.includes(".omo/") &&
				                          !file.includes(".omx/") &&
				                          !file.includes("node_modules/");
				return isSource && isNotTestOrConfig;
			});

		if (modifiedSourceFiles.length > 0) {
			// Code changes occurred! Read all evidence file contents
			let combinedContent = evidenceStr;
			for (const match of matches) {
				const absolutePath = resolve(repoRoot, match);
				try {
					combinedContent += "\n" + readFileSync(absolutePath, "utf8");
				} catch {
					// Ignore read errors
				}
			}

			// Verify test passing indicator in the combined content
			const testFilePattern = /(?:test|spec|suite|_test\.go|\.test\.ts|\.spec\.ts)/i;
			const testPassPattern = /(?:pass|ok|✔|test result: ok)/i;

			if (!testFilePattern.test(combinedContent) || !testPassPattern.test(combinedContent)) {
				throw new UlwLoopError(
					`Always-Grounded Verification: Code changes were detected in source files (${modifiedSourceFiles.join(", ")}). You must run the corresponding unit tests and include the test execution logs/reports in the evidence.`,
					"ulw_loop_verification_test_logs_missing"
				);
			}
		}
	}
}

function ulwLoopFail(message: string, code: string, details: Record<string, unknown> = {}): never {
	throw new UlwLoopError(message, code, { details });
}

function ledgerKind(status: EvidenceStatus): UlwLoopLedgerEntry["kind"] {
	switch (status) {
		case "pass":
			return "evidence_captured";
		case "fail":
			return "criterion_failed";
		case "blocked":
			return "criterion_blocked";
		default:
			return ulwLoopFail("Invalid criterion status.", "ULW_LOOP_CRITERION_STATUS_INVALID", { status });
	}
}

function findGoal(plan: UlwLoopPlan, goalId: string): UlwLoopItem {
	const goal = plan.goals.find((candidate) => candidate.id === goalId);
	return goal ?? ulwLoopFail(`UlwLoop goal not found: ${goalId}.`, "ULW_LOOP_GOAL_NOT_FOUND", { goalId });
}

function findCriterion(goal: UlwLoopItem, criterionId: string): UlwLoopSuccessCriterion {
	const criterion = goal.successCriteria.find((candidate) => candidate.id === criterionId);
	return (
		criterion ??
		ulwLoopFail(`Success criterion not found: ${criterionId}.`, "ULW_LOOP_CRITERION_NOT_FOUND", {
			goalId: goal.id,
			criterionId,
		})
	);
}

function nonEmptyEvidence(evidence: string): string {
	const trimmed = evidence.trim();
	return trimmed || ulwLoopFail("Evidence must be a non-empty string.", "ULW_LOOP_EVIDENCE_REQUIRED", {});
}

export async function recordEvidence(
	repoRoot: string,
	args: RecordEvidenceArgs,
	scope?: UlwLoopScope,
): Promise<{
	plan: UlwLoopPlan;
	goal: UlwLoopItem;
	criterion: UlwLoopSuccessCriterion;
	ledgerEntry: UlwLoopLedgerEntry;
}> {
	return withUlwLoopMutationLock(repoRoot, scope, async () => {
		const plan = await readUlwLoopPlan(repoRoot, scope);
		const goal = findGoal(plan, args.goalId);
		const criterion = findCriterion(goal, args.criterionId);
		const evidence = nonEmptyEvidence(args.evidence);

		if (args.status === "pass" && !process.env.VITEST && process.env.NODE_ENV !== "test") {
			verifyPhysicalEvidence(repoRoot, evidence);
		}

		const kind = ledgerKind(args.status);
		const prevStatus = criterion.status;
		const capturedAt = iso();
		criterion.status = args.status;
		criterion.capturedEvidence = evidence;
		criterion.capturedAt = capturedAt;
		if (args.notes !== undefined) criterion.notes = args.notes;
		goal.updatedAt = capturedAt;
		plan.updatedAt = capturedAt;
		await writePlan(repoRoot, plan, scope);
		const ledgerEntry: UlwLoopLedgerEntry = {
			at: capturedAt,
			kind,
			goalId: goal.id,
			criterionId: criterion.id,
			criterionStatus: args.status,
			evidence,
			capturedEvidence: evidence,
			before: { status: prevStatus },
			after: { goalId: goal.id, criterionId: criterion.id, status: args.status, evidence, capturedAt, prevStatus },
		};
		await appendLedger(repoRoot, ledgerEntry, scope);
		return { plan, goal, criterion, ledgerEntry };
	});
}

export async function markCriteriaPendingResetForGoal(
	repoRoot: string,
	goalId: string,
	scope?: UlwLoopScope,
): Promise<{ plan: UlwLoopPlan; resetCount: number }> {
	return withUlwLoopMutationLock(repoRoot, scope, async () => {
		const plan = await readUlwLoopPlan(repoRoot, scope);
		const goal = findGoal(plan, goalId);
		const now = iso();
		const before = goal.successCriteria.map((criterion) => ({
			id: criterion.id,
			status: criterion.status,
			capturedEvidence: criterion.capturedEvidence,
			capturedAt: criterion.capturedAt ?? null,
		}));
		for (const criterion of goal.successCriteria) {
			criterion.status = "pending";
			criterion.capturedEvidence = null;
			delete criterion.capturedAt;
			delete criterion.notes;
		}
		goal.updatedAt = now;
		plan.updatedAt = now;
		await writePlan(repoRoot, plan, scope);
		await appendLedger(
			repoRoot,
			{
				at: now,
				kind: "criteria_revised",
				goalId,
				message: `Reset ${goal.successCriteria.length} criteria to pending.`,
				before,
				after: { resetCount: goal.successCriteria.length },
			},
			scope,
		);
		return { plan, resetCount: goal.successCriteria.length };
	});
}

export function criteriaSummary(plan: UlwLoopPlan): {
	totalCriteria: number;
	passCount: number;
	pendingCount: number;
	failCount: number;
	blockedCount: number;
	goalsWithUnresolvedCriteria: string[];
} {
	let totalCriteria = 0;
	let passCount = 0;
	let pendingCount = 0;
	let failCount = 0;
	let blockedCount = 0;
	const goalsWithUnresolvedCriteria: string[] = [];
	for (const goal of plan.goals) {
		let unresolved = false;
		for (const criterion of goal.successCriteria) {
			totalCriteria += 1;
			if (criterion.status !== "pass") unresolved = true;
			switch (criterion.status) {
				case "pass":
					passCount += 1;
					break;
				case "pending":
					pendingCount += 1;
					break;
				case "fail":
					failCount += 1;
					break;
				case "blocked":
					blockedCount += 1;
					break;
				default:
					ulwLoopFail("Invalid criterion status.", "ULW_LOOP_CRITERION_STATUS_INVALID", {
						status: criterion.status,
					});
			}
		}
		if (unresolved) goalsWithUnresolvedCriteria.push(goal.id);
	}
	return { totalCriteria, passCount, pendingCount, failCount, blockedCount, goalsWithUnresolvedCriteria };
}

export function unresolvedCriteriaOf(goal: UlwLoopItem): UlwLoopSuccessCriterion[] {
	return goal.successCriteria.filter((criterion) => criterion.status !== "pass");
}

export function unresolvedEssentialCriteriaOf(goal: UlwLoopItem): readonly UlwLoopSuccessCriterion[] {
	const essentialCriteria = new Set(essentialCriteriaOf(goal).map((criterion) => criterion.id));
	return goal.successCriteria.filter(
		(criterion) => essentialCriteria.has(criterion.id) && criterion.status !== "pass",
	);
}

export function requireAllCriteriaPass(goal: UlwLoopItem): void {
	if (hasAllCriteriaPass(goal)) return;
	throw new UlwLoopError(`Goal ${goal.id} has unresolved success criteria.`, "ulw_loop_criteria_not_all_pass", {
		details: {
			goalId: goal.id,
			unresolved: unresolvedCriteriaOf(goal).map((criterion) => ({ id: criterion.id, status: criterion.status })),
		},
	});
}

export function requireAllPlanCriteriaPass(plan: UlwLoopPlan): void {
	const unresolved = plan.goals.flatMap((goal) =>
		unresolvedCriteriaOf(goal).map((criterion) => ({
			goalId: goal.id,
			id: criterion.id,
			status: criterion.status,
		})),
	);
	if (unresolved.length === 0) return;
	throw new UlwLoopError("Ulw-loop aggregate has unresolved success criteria.", "ulw_loop_criteria_not_all_pass", {
		details: { unresolved },
	});
}

export function requireEssentialCriteriaPass(goal: UlwLoopItem): void {
	if (hasEssentialCriteriaPass(goal)) return;
	throw new UlwLoopError(
		`Goal ${goal.id} has unresolved essential success criteria.`,
		"ulw_loop_criteria_not_all_pass",
		{
			details: {
				goalId: goal.id,
				unresolved: unresolvedEssentialCriteriaOf(goal).map((criterion) => ({
					id: criterion.id,
					status: criterion.status,
				})),
			},
		},
	);
}
