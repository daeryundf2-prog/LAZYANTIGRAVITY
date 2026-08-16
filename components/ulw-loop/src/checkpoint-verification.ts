// biome-ignore-all format: keep LOC under budget.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatCodexGoalReconciliation, readCodexGoalSnapshotInput, reconcileCodexGoalSnapshot } from "./codex-goal-snapshot.js";
import { dispatchConsensus } from "./consensus-dispatcher.js";
import { appendRunEvent, readRunEvents } from "./control-plane.js";
import type { QualityEvidenceEnvelope, SubagentResultEnvelope } from "./control-plane-types.js";
import { codexGoalMode, compatibleCodexObjectives, expectedCodexObjective, isFinalRunCompletionCandidate } from "./goal-status.js";
import { collectLspDiagnostics, collectRulesViolations, injectFeedbackContext } from "./lsp-rules-feedback.js";
import { normalizeUlwLoopSessionId, resolveUlwLoopSessionIdFromEnv, type UlwLoopScope, ulwLoopBriefPath } from "./paths.js";
import { validateQualityGate } from "./quality-gate.js";
import { checkStagnation, loadStagnationPolicy } from "./stagnation-guard.js";
import type { UlwLoopAggregateCompletion, UlwLoopItem, UlwLoopPlan, UlwLoopQualityGate } from "./types.js";
import { ULW_LOOP_DIR, ULW_LOOP_GOALS, ULW_LOOP_LEDGER, UlwLoopError } from "./types.js";
import { calculateQualityFingerprint, loadVerificationPolicy, runVerificationPipeline, type VerificationContext } from "./verification-pipeline.js";

function textMentionsUlwLoopPlanArtifact(value: string | undefined): boolean {
	const normalized = (value ?? "").toLowerCase();
	return normalized.includes(ULW_LOOP_DIR.toLowerCase()) || normalized.includes(ULW_LOOP_GOALS.toLowerCase()) || normalized.includes(ULW_LOOP_LEDGER.toLowerCase());
}

function textMentionsGoalId(value: string | undefined, goalId: string): boolean {
	return (value ?? "").toLowerCase().includes(goalId.toLowerCase());
}

function textHasCompletionValidationEvidence(value: string | undefined): boolean {
	const normalized = (value ?? "").toLowerCase();
	const done = /\b(?:planned work|implementation|deliverables?|scope|task|work)\b/.test(normalized) && /\b(?:done|complete|completed|finished|shipped)\b/.test(normalized);
	const verified = /\b(?:validation|verification|tests?|build|lint|review|quality gate|code-review)\b/.test(normalized) && /\b(?:passed|complete|completed|clean|green|approve|approved|clear)\b/.test(normalized);
	return done && verified;
}

async function snapshotObjectiveMapsToUlwLoopPlan(repoRoot: string, snapshotObjective: string, scope?: UlwLoopScope): Promise<boolean> {
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

async function canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot: string, plan: UlwLoopPlan, goal: UlwLoopItem, snapshotObjective: string, evidence: string, scope?: UlwLoopScope): Promise<boolean> {
	if (codexGoalMode(plan) !== "aggregate") return false;
	if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id) return false;
	if (isFinalRunCompletionCandidate(plan, goal)) return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
	if (!textMentionsUlwLoopPlanArtifact(evidence) || !textMentionsGoalId(evidence, goal.id)) return false;
	if (!textHasCompletionValidationEvidence(evidence)) return false;
	return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
}

async function canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot: string, plan: UlwLoopPlan, goal: UlwLoopItem, snapshotObjective: string, evidence: string, scope?: UlwLoopScope): Promise<boolean> {
	if (codexGoalMode(plan) !== "aggregate") return false;
	if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id) return false;
	if (!isFinalRunCompletionCandidate(plan, goal)) return false;
	if (!textHasCompletionValidationEvidence(evidence)) return false;
	return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
}

function buildCompletedLegacyGoalRemediation(goal: UlwLoopItem): string {
	return [
		"If get_goal returns a different completed legacy/thread objective, do not repeat --status complete in this thread.",
		`Record a non-terminal blocker with: omo ulw-loop checkpoint --goal-id ${goal.id} --status blocked --evidence "<completed legacy Codex goal blocks create_goal in this thread>" --codex-goal-json "<different completed get_goal JSON or path>".`,
		"Then continue only from a Codex goal context with no active/completed conflicting goal, in the same repo/worktree, and create the intended goal there.",
	].join(" ");
}

function buildTaskScopedAggregateReconciliationHint(goal: UlwLoopItem, final: boolean): string {
	if (final) {
		return ` Final task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress final OMO goal and the completed get_goal objective to map to the ulw-loop brief or artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
	}
	return ` Completed task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress OMO goal, evidence that names that active OMO goal id, names .omo/ulw-loop/goals.json or ledger.jsonl, includes completed implementation plus validation/review evidence, and a get_goal objective that maps to the ulw-loop brief/artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
}

async function readJsonInput(raw: string | undefined, repoRoot: string): Promise<unknown> {
	if (raw === undefined || raw.trim() === "") return undefined;
	const trimmed = raw.trim();
	try { return JSON.parse(trimmed); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
	const path = resolve(repoRoot, trimmed);
	if (!existsSync(path)) throw new UlwLoopError("Quality gate JSON is neither valid JSON nor a readable path.", "ulw_loop_json_input_invalid");
	try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { throw new UlwLoopError(`Quality gate path does not contain valid JSON${error instanceof Error ? `: ${error.message}` : "."}`, "ulw_loop_json_input_invalid"); }
}

function makeAggregateCompletion(now: string, evidence: string, codexGoal: unknown): UlwLoopAggregateCompletion {
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

export async function runCheckpointQualityGate(
	repoRoot: string,
	goal: UlwLoopItem,
	plan: UlwLoopPlan,
	evidence: string,
	args: { readonly codexGoalJson?: string; readonly qualityGateJson?: string },
	now: string,
	scope?: UlwLoopScope,
): Promise<CheckpointQualityGateResult> {
	const runId = normalizeUlwLoopSessionId(scope?.sessionId) ?? resolveUlwLoopSessionIdFromEnv() ?? "default-run";
	const events = await readRunEvents(repoRoot, runId);

	const stagnationPolicy = await loadStagnationPolicy(repoRoot);
	const stagnationResult = checkStagnation(events, stagnationPolicy);
	if (stagnationResult.status !== "ok") {
		const payload = stagnationResult.payload;
		if (payload) {
			if (!events.some((e) => e.type === "parent.stagnation_detected" && e.fingerprint === payload.fingerprint)) {
				await appendRunEvent(repoRoot, runId, "parent.stagnation_detected", {
					...payload,
					fingerprint: payload.fingerprint,
				});
			}
		}
	}

	const completedEvents = events.filter((e) => e.type === "agent.completed_reported");
	const latestCompleted = completedEvents[completedEvents.length - 1];
	const subagentResult = latestCompleted?.result as SubagentResultEnvelope | undefined;

	if (subagentResult === undefined) {
		throw new UlwLoopError(
			"No subagent completion event found. Refusing to fabricate evidence — checkpoint requires a real agent.completed_reported event with filesChanged and commandsRun.",
			"ulw_loop_missing_subagent_result",
		);
	}

	const filesChanged = subagentResult.filesChanged ?? [];
	const commandsRun = subagentResult.commandsRun ?? [];

	const evidenceEnvelope: QualityEvidenceEnvelope = {
		goal: goal.objective,
		summary: evidence,
		filesChanged,
		commandsRun,
		testResults: commandsRun.filter((c) => c.includes("test")),
		artifactsGenerated: subagentResult.artifactsGenerated ?? [],
		completedRoles: events.filter((e) => e.type === "agent.completed_reported" && e.role).map((e) => e.role as string),
		acknowledgedRoles: events.filter((e) => e.type === "parent.acknowledged" && e.role).map((e) => e.role as string),
		dryRunSafety: true,
	};

	const fingerprint = calculateQualityFingerprint(evidenceEnvelope);

	const existingCompletion = events.find(
		(e) => e.type === "quality_gate.completed" && e.qualityInputFingerprint === fingerprint,
	);
	if (existingCompletion) {
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
		let aggregateCompletion: UlwLoopAggregateCompletion | undefined;
		if (final) aggregateCompletion = makeAggregateCompletion(now, evidence, codexGoal);
		let qualityGate: UlwLoopQualityGate | undefined;
		if (final || aggregateCompletion !== undefined)
			qualityGate = validateQualityGate(await readJsonInput(args.qualityGateJson, repoRoot));

		return {
			finalizerAllowed: true,
			qualityGate,
			codexGoal,
			aggregateCompletion,
		};
	}

	const existingFailure = events.find(
		(e) => e.type === "quality_gate.failed" && e.qualityInputFingerprint === fingerprint,
	);
	if (existingFailure) {
		const lastMechFailed = events.find(
			(e) => e.type === "quality_gate.mechanical_failed" && e.qualityInputFingerprint === fingerprint,
		);
		const conFailed = events.find(
			(e) =>
				(e.type === "quality_gate.consensus_failed" ||
					e.type === "quality_gate.consensus_inconclusive" ||
					e.type === "quality_gate.consensus_rework_required") &&
				e.qualityInputFingerprint === fingerprint,
		);
		let goalStatusOverride: UlwLoopItem["status"] | undefined;
		let blockedReasonOverride: string | undefined;
		let failedReasonOverride: string | undefined;
		if (lastMechFailed) {
			goalStatusOverride = "failed";
			failedReasonOverride = (lastMechFailed.reason as string) || "Mechanical check failed";
		} else if (conFailed) {
			if (conFailed.type === "quality_gate.consensus_inconclusive") {
				goalStatusOverride = "needs_user_decision";
				blockedReasonOverride = (conFailed.reason as string) || "Consensus inconclusive";
			} else if (conFailed.type === "quality_gate.consensus_rework_required") {
				goalStatusOverride = "in_progress";
			} else {
				goalStatusOverride = "failed";
				failedReasonOverride = (conFailed.reason as string) || "Consensus failed";
			}
		} else {
			goalStatusOverride = "failed";
			failedReasonOverride = (existingFailure.reason as string) || "Verification pipeline failed";
		}
		return {
			finalizerAllowed: false,
			goalStatusOverride,
			blockedReasonOverride,
			failedReasonOverride,
		};
	}

	const reworkEvents = events.filter((e) => e.type === "quality_gate.consensus_rework_required" && e.qualityInputFingerprint === fingerprint);
	if (reworkEvents.length >= 3) {
		await appendRunEvent(repoRoot, runId, "parent.hitl_required", {
			reason: "Consensus rework iteration limit reached (max 3 reworks). User intervention required.",
			qualityInputFingerprint: fingerprint,
		});
		return {
			finalizerAllowed: false,
			goalStatusOverride: "needs_user_decision",
			blockedReasonOverride: "Consensus rework iteration limit reached (max 3 reworks)",
		};
	}

	await appendRunEvent(repoRoot, runId, "quality_gate.started", {
		qualityInputFingerprint: fingerprint,
	});

	const lspDiagnostics = await collectLspDiagnostics(repoRoot, filesChanged);
	const rulesViolations = await collectRulesViolations(repoRoot, filesChanged);

	const isSecuritySensitive =
		/\b(security|auth|login|password|encrypt|token|credential|permission)\b/i.test(goal.objective) ||
		/\b(security|auth|login|password|encrypt|token|credential|permission)\b/i.test(evidence);
	const isPublicRelease =
		/\b(release|publish|deploy|production|public)\b/i.test(goal.objective) ||
		/\b(release|publish|deploy|production|public)\b/i.test(evidence);
	const isDestructive =
		/\b(delete|remove|destroy|drop|truncate|destructive)\b/i.test(goal.objective) ||
		/\b(delete|remove|destroy|drop|truncate|destructive)\b/i.test(evidence);

	let riskLevel: "low" | "medium" | "high" = "low";
	if (
		isSecuritySensitive ||
		isPublicRelease ||
		isDestructive ||
		filesChanged.length > 5 ||
		lspDiagnostics.length > 0 ||
		rulesViolations.length > 0
	) {
		riskLevel = "high";
	} else if (filesChanged.length > 2) {
		riskLevel = "medium";
	}

	const ctx: VerificationContext = {
		runId,
		events,
		evidence: evidenceEnvelope,
		goal: goal.objective,
		wouldSwitchModel: false,
		isDryRun: true,
		riskLevel,
		destructiveChange: isDestructive,
		publicRelease: isPublicRelease,
		securitySensitive: isSecuritySensitive,
		lspDiagnostics,
		rulesViolations,
	};

	const policy = await loadVerificationPolicy(repoRoot);
	const gateResults = runVerificationPipeline(ctx, policy);

	const mechResult = gateResults.find((r) => r.stage === "mechanical");
	const semResult = gateResults.find((r) => r.stage === "semantic");
	const conResult = gateResults.find((r) => r.stage === "consensus");

	if (mechResult?.status === "failed") {
		await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_failed", {
			reason: mechResult.reason || "Mechanical check failed",
			qualityInputFingerprint: fingerprint,
		});
		await appendRunEvent(repoRoot, runId, "quality_gate.failed", {
			reason: "Verification pipeline failed at mechanical stage",
			qualityInputFingerprint: fingerprint,
		});
		return {
			finalizerAllowed: false,
			goalStatusOverride: "failed",
			failedReasonOverride: mechResult.reason || "Mechanical check failed",
		};
	}

	if (semResult?.status === "failed") {
		await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_passed", {
			qualityInputFingerprint: fingerprint,
		});
		await appendRunEvent(repoRoot, runId, "quality_gate.failed", {
			reason: semResult.reason || "Semantic check failed",
			qualityInputFingerprint: fingerprint,
		});
		return {
			finalizerAllowed: false,
			goalStatusOverride: "failed",
			failedReasonOverride: semResult.reason || "Semantic check failed",
		};
	}

	await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_passed", {
		qualityInputFingerprint: fingerprint,
	});

	let finalizerAllowed = true;
	let goalStatusOverride: UlwLoopItem["status"] | undefined;
	let blockedReasonOverride: string | undefined;
	let failedReasonOverride: string | undefined;

	if (conResult?.status === "required") {
		await appendRunEvent(repoRoot, runId, "quality_gate.consensus_required", {
			reason: conResult.reason || "Consensus required due to policy triggers",
			qualityInputFingerprint: fingerprint,
		});

		let consensusPrompt = `Verify the changes for goal: ${goal.objective}`;
		consensusPrompt = injectFeedbackContext(consensusPrompt, lspDiagnostics, rulesViolations);

		const isLiveAvailable = !!process.env["OPENCODE_API_URL"] || !!process.env["LAZYANTIGRAVITY_LIVE_CONSENSUS"];
		const isTestEnv = process.env["NODE_ENV"] === "test" || process.env["VITEST"] === "true";

		const dispatchRes = await dispatchConsensus(repoRoot, runId, fingerprint, {
			live: isLiveAvailable,
			mockLive: !isLiveAvailable && isTestEnv,
			prompt: consensusPrompt,
		});

		const updatedEvents = await readRunEvents(repoRoot, runId);
		const termEvent = updatedEvents.find(
			(e) =>
				(e.type === "quality_gate.consensus_passed" ||
					e.type === "quality_gate.consensus_failed" ||
					e.type === "quality_gate.consensus_rework_required" ||
					e.type === "quality_gate.consensus_inconclusive") &&
				e.consensusId === dispatchRes.consensusId,
		);

		if (termEvent) {
			if (termEvent.type === "quality_gate.consensus_passed") {
				finalizerAllowed = true;
			} else {
				finalizerAllowed = false;
				if (termEvent.type === "quality_gate.consensus_inconclusive") {
					goalStatusOverride = "needs_user_decision";
					blockedReasonOverride = termEvent.reason || "Consensus inconclusive";
					await appendRunEvent(repoRoot, runId, "parent.hitl_required", {
						reason: "Consensus inconclusive: User decision required",
						qualityInputFingerprint: fingerprint,
					});
				} else if (termEvent.type === "quality_gate.consensus_rework_required") {
					goalStatusOverride = "in_progress";
				} else {
					goalStatusOverride = "failed";
					failedReasonOverride = termEvent.reason || "Consensus failed";
				}
			}
		} else {
			finalizerAllowed = false;
			goalStatusOverride = "needs_user_decision";
			blockedReasonOverride = "Consensus could not resolve terminal state";
		}
	}

	if (!finalizerAllowed) {
		await appendRunEvent(repoRoot, runId, "quality_gate.failed", {
			reason: "Verification pipeline failed at consensus stage",
			qualityInputFingerprint: fingerprint,
		});
		return {
			finalizerAllowed: false,
			goalStatusOverride,
			blockedReasonOverride,
			failedReasonOverride,
		};
	}

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
	let aggregateCompletion: UlwLoopAggregateCompletion | undefined;
	if (!reconciliation.ok) {
		const objective = snapshot?.objective;
		const mismatchedTaskObjective =
			snapshot?.available === true &&
			objective !== undefined &&
			objective.replace(/\s+/g, " ").trim().toLowerCase() !== expectedCodexObjective(plan, goal).replace(/\s+/g, " ").trim().toLowerCase();
		const completedTaskScoped =
			mismatchedTaskObjective &&
			snapshot.status === "complete" &&
			(await canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope));
		const activeFinalTaskScoped =
			mismatchedTaskObjective &&
			snapshot.status === "active" &&
			(await canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope));
		const taskScoped = completedTaskScoped || activeFinalTaskScoped;
		if (!taskScoped)
			throw new UlwLoopError(
				`${formatCodexGoalReconciliation(reconciliation)}${
					aggregate && snapshot?.status === "complete" && objective !== undefined
						? buildTaskScopedAggregateReconciliationHint(goal, final)
						: ""
				}`,
				"ulw_loop_codex_snapshot_mismatch",
			);
		aggregateCompletion = makeAggregateCompletion(now, evidence, codexGoal);
	}
	if (final) aggregateCompletion = makeAggregateCompletion(now, evidence, codexGoal);
	let qualityGate: UlwLoopQualityGate | undefined;
	if (final || aggregateCompletion !== undefined)
		qualityGate = validateQualityGate(await readJsonInput(args.qualityGateJson, repoRoot));

	await appendRunEvent(repoRoot, runId, "quality_gate.completed", {
		qualityInputFingerprint: fingerprint,
	});

	return {
		finalizerAllowed: true,
		qualityGate,
		codexGoal,
		aggregateCompletion,
	};
}
