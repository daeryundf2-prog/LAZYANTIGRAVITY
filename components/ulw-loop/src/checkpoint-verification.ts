import { runCheckpointConsensusStep } from "./checkpoint-consensus-step.js";
import { type CheckpointQualityGateResult, reconcileCheckpointSnapshot } from "./checkpoint-reconciliation.js";
import { appendRunEvent, readRunEvents } from "./control-plane.js";
import type { QualityEvidenceEnvelope, SubagentResultEnvelope } from "./control-plane-types.js";
import { assertGateUnlocked, assertGroundTruthEvidence, writeGateFailedMarker } from "./evidence-completion-gate.js";
import { collectLspDiagnostics, collectRulesViolations } from "./lsp-rules-feedback.js";
import { normalizeUlwLoopSessionId, resolveUlwLoopSessionIdFromEnv, type UlwLoopScope } from "./paths.js";
import { checkPriorGateEvents } from "./previous-gate-events.js";
import { checkStagnation, loadStagnationPolicy } from "./stagnation-guard.js";
import type { UlwLoopItem, UlwLoopPlan } from "./types.js";
import {
	calculateQualityFingerprint,
	createVerificationContext,
	loadVerificationPolicy,
	runVerificationPipeline,
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
	const stag = checkStagnation(events, stagnationPolicy);
	if (
		stag.status !== "ok" &&
		stag.payload &&
		!events.some((e) => e.type === "parent.stagnation_detected" && e.fingerprint === stag.payload?.fingerprint)
	) {
		await appendRunEvent(repoRoot, runId, "parent.stagnation_detected", {
			...stag.payload,
			fingerprint: stag.payload.fingerprint,
		});
	}
	const completed = events.filter((e) => e.type === "agent.completed_reported");
	const subResult = completed[completed.length - 1]?.result as SubagentResultEnvelope | undefined;
	const isAck = subResult?.agentId
		? events.some((e) => e.type === "parent.acknowledged" && e.agentId === subResult.agentId)
		: false;
	if (!isAck && subResult?.agentId) {
		await appendRunEvent(repoRoot, runId, "parent.acknowledged", { agentId: subResult.agentId });
	}
	const filesChanged = subResult?.filesChanged || [];
	const commandsRun = subResult?.commandsRun || [];
	const artifactsGenerated = subResult?.artifactsGenerated || [];
	const completedRoles = subResult ? [subResult.role] : [];
	const acknowledgedRoles = isAck && subResult ? [subResult.role] : [];

	let qgParsed: Record<string, unknown> | undefined;
	if (args.qualityGateJson) {
		try {
			qgParsed = JSON.parse(args.qualityGateJson) as Record<string, unknown>;
		} catch {}
	}
	const factualityScore =
		typeof subResult?.factualityScore === "number"
			? subResult.factualityScore
			: typeof qgParsed?.["factualityScore"] === "number"
				? (qgParsed["factualityScore"] as number)
				: undefined;
	const coveVerified =
		subResult?.coveVerified !== undefined
			? subResult.coveVerified
			: typeof qgParsed?.["coveVerified"] === "boolean"
				? (qgParsed["coveVerified"] as boolean)
				: undefined;

	const evidenceEnvelope: QualityEvidenceEnvelope = {
		goal: goal.objective,
		summary: evidence || subResult?.summary || "",
		filesChanged,
		commandsRun,
		testResults: commandsRun.filter((c) => /test/i.test(c)),
		artifactsGenerated,
		completedRoles,
		acknowledgedRoles,
		dryRunSafety: true,
		...(factualityScore !== undefined ? { factualityScore } : {}),
		...(coveVerified !== undefined ? { coveVerified } : {}),
	};
	const fingerprint = calculateQualityFingerprint(evidenceEnvelope);
	const priorResult = await checkPriorGateEvents(
		repoRoot,
		runId,
		events,
		fingerprint,
		plan,
		goal,
		evidence,
		evidenceEnvelope,
		now,
		args,
		scope,
	);
	if (priorResult !== null) return priorResult;

	await appendRunEvent(repoRoot, runId, "quality_gate.started", { qualityInputFingerprint: fingerprint });
	// Physical data-flow lock: a previous verification failure locks the gate
	// until a successful ground-truth re-verification clears the marker.
	assertGateUnlocked(repoRoot);
	const lspDiagnostics = await collectLspDiagnostics(repoRoot, filesChanged);
	const rulesViolations = await collectRulesViolations(repoRoot, filesChanged);
	const ctx = createVerificationContext({
		runId,
		events,
		evidenceEnvelope,
		objective: goal.objective,
		evidence,
		filesChanged,
		lspDiagnostics,
		rulesViolations,
	});
	const policy = await loadVerificationPolicy(repoRoot);
	const gateResults = runVerificationPipeline(ctx, policy);
	const mech = gateResults.find((r) => r.stage === "mechanical");
	const sem = gateResults.find((r) => r.stage === "semantic");
	const con = gateResults.find((r) => r.stage === "consensus");
	if (mech?.status === "failed") {
		await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_failed", {
			reason: mech.reason || "Mechanical check failed",
			qualityInputFingerprint: fingerprint,
		});
		await appendRunEvent(repoRoot, runId, "quality_gate.failed", {
			reason: "Verification pipeline failed at mechanical stage",
			qualityInputFingerprint: fingerprint,
		});
		writeGateFailedMarker(repoRoot, mech.reason || "Mechanical check failed", "ULW_LOOP_MECHANICAL_FAILED");
		return {
			finalizerAllowed: false,
			goalStatusOverride: "failed",
			failedReasonOverride: mech.reason || "Mechanical check failed",
		};
	}
	if (sem?.status === "failed") {
		await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_passed", { qualityInputFingerprint: fingerprint });
		await appendRunEvent(repoRoot, runId, "quality_gate.failed", {
			reason: sem.reason || "Semantic check failed",
			qualityInputFingerprint: fingerprint,
		});
		writeGateFailedMarker(repoRoot, sem.reason || "Semantic check failed", "ULW_LOOP_SEMANTIC_FAILED");
		return {
			finalizerAllowed: false,
			goalStatusOverride: "failed",
			failedReasonOverride: sem.reason || "Semantic check failed",
		};
	}
	await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_passed", { qualityInputFingerprint: fingerprint });
	let finalizerAllowed = true;
	let goalStatusOverride: UlwLoopItem["status"] | undefined;
	let blockedReasonOverride: string | undefined;
	let failedReasonOverride: string | undefined;
	if (con?.status === "required") {
		await appendRunEvent(repoRoot, runId, "quality_gate.consensus_required", {
			reason: con.reason || "Consensus required due to policy triggers",
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
		writeGateFailedMarker(repoRoot, failedReasonOverride || "Consensus stage failed", "ULW_LOOP_CONSENSUS_FAILED");
		return {
			finalizerAllowed: false,
			...(goalStatusOverride !== undefined ? { goalStatusOverride } : {}),
			...(blockedReasonOverride !== undefined ? { blockedReasonOverride } : {}),
			...(failedReasonOverride !== undefined ? { failedReasonOverride } : {}),
		};
	}
	const reconciled = await reconcileCheckpointSnapshot(repoRoot, plan, goal, evidence, now, args, scope);
	try {
		await assertGroundTruthEvidence(repoRoot, args.qualityGateJson, events, evidenceEnvelope);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await appendRunEvent(repoRoot, runId, "quality_gate.failed", {
			reason: `Ground-Truth evidence verification failed: ${reason}`,
			qualityInputFingerprint: fingerprint,
		});
		return {
			finalizerAllowed: false,
			goalStatusOverride: "needs_user_decision",
			blockedReasonOverride: reason,
		};
	}
	await appendRunEvent(repoRoot, runId, "quality_gate.completed", { qualityInputFingerprint: fingerprint });
	return { finalizerAllowed: true, ...reconciled };
}
