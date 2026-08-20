import { runCheckpointConsensusStep } from "./checkpoint-consensus-step.js";
import {
	buildTaskScopedAggregateReconciliationHint,
	type CheckpointQualityGateResult,
	canReconcileActiveFinalTaskScopedAggregateSnapshot,
	canReconcileCompletedTaskScopedAggregateSnapshot,
	makeAggregateCompletion,
	readJsonInput,
} from "./checkpoint-reconciliation.js";
import {
	formatCodexGoalReconciliation,
	readCodexGoalSnapshotInput,
	reconcileCodexGoalSnapshot,
} from "./codex-goal-snapshot.js";
import { appendRunEvent, readRunEvents } from "./control-plane.js";
import type { QualityEvidenceEnvelope, SubagentResultEnvelope } from "./control-plane-types.js";
import {
	codexGoalMode,
	compatibleCodexObjectives,
	expectedCodexObjective,
	isFinalRunCompletionCandidate,
} from "./goal-status.js";
import { collectLspDiagnostics, collectRulesViolations } from "./lsp-rules-feedback.js";
import { normalizeUlwLoopSessionId, resolveUlwLoopSessionIdFromEnv, type UlwLoopScope } from "./paths.js";
import { validateQualityGate } from "./quality-gate.js";
import { checkStagnation, loadStagnationPolicy } from "./stagnation-guard.js";
import type { UlwLoopAggregateCompletion, UlwLoopItem, UlwLoopPlan } from "./types.js";
import { UlwLoopError } from "./types.js";
import {
	calculateQualityFingerprint,
	loadVerificationPolicy,
	runVerificationPipeline,
	type VerificationContext,
} from "./verification-pipeline.js";

export type { CheckpointQualityGateResult };

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
		if (
			payload &&
			!events.some((e) => e.type === "parent.stagnation_detected" && e.fingerprint === payload.fingerprint)
		) {
			await appendRunEvent(repoRoot, runId, "parent.stagnation_detected", {
				...payload,
				fingerprint: payload.fingerprint,
			});
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
		completedRoles: events
			.filter((e) => e.type === "agent.completed_reported" && e.role)
			.map((e) => e.role as string),
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
		const aggregateCompletion = final ? makeAggregateCompletion(now, evidence, codexGoal) : undefined;
		const qualityGate =
			final || aggregateCompletion !== undefined
				? validateQualityGate(await readJsonInput(args.qualityGateJson, repoRoot))
				: undefined;
		return { finalizerAllowed: true, qualityGate, codexGoal, aggregateCompletion };
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
		let goalStatusOverride: UlwLoopItem["status"] = "failed";
		let blockedReasonOverride: string | undefined;
		let failedReasonOverride = (existingFailure.reason as string) || "Verification pipeline failed";

		if (lastMechFailed) failedReasonOverride = (lastMechFailed.reason as string) || "Mechanical check failed";
		else if (conFailed) {
			if (conFailed.type === "quality_gate.consensus_inconclusive") {
				goalStatusOverride = "needs_user_decision";
				blockedReasonOverride = (conFailed.reason as string) || "Consensus inconclusive";
			} else if (conFailed.type === "quality_gate.consensus_rework_required") {
				goalStatusOverride = "in_progress";
			} else {
				failedReasonOverride = (conFailed.reason as string) || "Consensus failed";
			}
		}
		return { finalizerAllowed: false, goalStatusOverride, blockedReasonOverride, failedReasonOverride };
	}

	const reworkEvents = events.filter(
		(e) => e.type === "quality_gate.consensus_rework_required" && e.qualityInputFingerprint === fingerprint,
	);
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

	await appendRunEvent(repoRoot, runId, "quality_gate.started", { qualityInputFingerprint: fingerprint });
	const lspDiagnostics = await collectLspDiagnostics(repoRoot, filesChanged);
	const rulesViolations = await collectRulesViolations(repoRoot, filesChanged);

	const isSecuritySensitive = /\b(security|auth|login|password|encrypt|token|credential|permission)\b/i.test(
		`${goal.objective} ${evidence}`,
	);
	const isPublicRelease = /\b(release|publish|deploy|production|public)\b/i.test(`${goal.objective} ${evidence}`);
	const isDestructive = /\b(delete|remove|destroy|drop|truncate|destructive)\b/i.test(`${goal.objective} ${evidence}`);

	let riskLevel: "low" | "medium" | "high" = "low";
	if (
		isSecuritySensitive ||
		isPublicRelease ||
		isDestructive ||
		filesChanged.length > 5 ||
		lspDiagnostics.length > 0 ||
		rulesViolations.length > 0
	)
		riskLevel = "high";
	else if (filesChanged.length > 2) riskLevel = "medium";

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
		await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_passed", { qualityInputFingerprint: fingerprint });
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

	await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_passed", { qualityInputFingerprint: fingerprint });

	let finalizerAllowed = true;
	let goalStatusOverride: UlwLoopItem["status"] | undefined;
	let blockedReasonOverride: string | undefined;
	let failedReasonOverride: string | undefined;

	if (conResult?.status === "required") {
		await appendRunEvent(repoRoot, runId, "quality_gate.consensus_required", {
			reason: conResult.reason || "Consensus required due to policy triggers",
			qualityInputFingerprint: fingerprint,
		});
		const conStep = await runCheckpointConsensusStep(
			repoRoot,
			runId,
			fingerprint,
			goal,
			lspDiagnostics,
			rulesViolations,
		);
		finalizerAllowed = conStep.finalizerAllowed;
		goalStatusOverride = conStep.goalStatusOverride;
		blockedReasonOverride = conStep.blockedReasonOverride;
		failedReasonOverride = conStep.failedReasonOverride;
	}

	if (!finalizerAllowed) {
		await appendRunEvent(repoRoot, runId, "quality_gate.failed", {
			reason: "Verification pipeline failed at consensus stage",
			qualityInputFingerprint: fingerprint,
		});
		return { finalizerAllowed: false, goalStatusOverride, blockedReasonOverride, failedReasonOverride };
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
		const mismatched =
			snapshot?.available === true &&
			objective !== undefined &&
			objective.replace(/\s+/g, " ").trim().toLowerCase() !==
				expectedCodexObjective(plan, goal).replace(/\s+/g, " ").trim().toLowerCase();
		const completedScoped =
			mismatched &&
			snapshot.status === "complete" &&
			(await canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope));
		const activeScoped =
			mismatched &&
			snapshot.status === "active" &&
			(await canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope));
		if (!completedScoped && !activeScoped) {
			throw new UlwLoopError(
				`${formatCodexGoalReconciliation(reconciliation)}${aggregate && snapshot?.status === "complete" && objective !== undefined ? buildTaskScopedAggregateReconciliationHint(goal, final) : ""}`,
				"ulw_loop_codex_snapshot_mismatch",
			);
		}
		aggregateCompletion = makeAggregateCompletion(now, evidence, codexGoal);
	}
	if (final) aggregateCompletion = makeAggregateCompletion(now, evidence, codexGoal);
	const qualityGate =
		final || aggregateCompletion !== undefined
			? validateQualityGate(await readJsonInput(args.qualityGateJson, repoRoot))
			: undefined;

	await appendRunEvent(repoRoot, runId, "quality_gate.completed", { qualityInputFingerprint: fingerprint });
	return { finalizerAllowed: true, qualityGate, codexGoal, aggregateCompletion };
}
