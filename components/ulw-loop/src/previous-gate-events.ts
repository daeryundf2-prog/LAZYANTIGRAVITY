import { reconcileCheckpointSnapshot, type CheckpointQualityGateResult } from "./checkpoint-reconciliation.js";
import { appendRunEvent } from "./control-plane.js";
import type { LedgerEvent, QualityEvidenceEnvelope } from "./control-plane-types.js";
import { assertGroundTruthEvidence } from "./evidence-completion-gate.js";
import type { UlwLoopScope } from "./paths.js";
import type { UlwLoopItem, UlwLoopPlan } from "./types.js";

const CONSENSUS_FAILED_TYPES = new Set([
	"quality_gate.consensus_failed",
	"quality_gate.consensus_inconclusive",
	"quality_gate.consensus_rework_required",
]);

export async function checkPriorGateEvents(
	repoRoot: string,
	runId: string,
	events: readonly LedgerEvent[],
	fingerprint: string,
	plan: UlwLoopPlan,
	goal: UlwLoopItem,
	evidence: string,
	evidenceEnvelope: QualityEvidenceEnvelope,
	now: string,
	args: { readonly codexGoalJson?: string; readonly qualityGateJson?: string },
	scope?: UlwLoopScope,
): Promise<CheckpointQualityGateResult | null> {
	let passEvent: LedgerEvent | undefined;
	let failEvent: LedgerEvent | undefined;
	let lastMech: LedgerEvent | undefined;
	let conFailed: LedgerEvent | undefined;
	let reworkCount = 0;

	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (!e || e.qualityInputFingerprint !== fingerprint) continue;
		if (!passEvent && e.type === "quality_gate.completed") passEvent = e;
		if (!failEvent && e.type === "quality_gate.failed") failEvent = e;
		if (!lastMech && e.type === "quality_gate.mechanical_failed") lastMech = e;
		if (!conFailed && CONSENSUS_FAILED_TYPES.has(e.type)) conFailed = e;
		if (e.type === "quality_gate.consensus_rework_required") reworkCount++;
	}

	if (passEvent) {
		await assertGroundTruthEvidence(repoRoot, args.qualityGateJson, events, evidenceEnvelope);
		return {
			finalizerAllowed: true,
			...(await reconcileCheckpointSnapshot(repoRoot, plan, goal, evidence, now, args, scope)),
		};
	}

	if (failEvent) {
		let goalStatusOverride: UlwLoopItem["status"] = "failed";
		let blockedReasonOverride: string | undefined;
		let failedReasonOverride = (failEvent.reason as string) || "Verification pipeline failed";
		if (lastMech) {
			failedReasonOverride = (lastMech.reason as string) || "Mechanical check failed";
		} else if (conFailed) {
			if (conFailed.type === "quality_gate.consensus_inconclusive") {
				goalStatusOverride = "needs_user_decision";
				blockedReasonOverride = (conFailed.reason as string) || "Consensus inconclusive";
			} else if (conFailed.type === "quality_gate.consensus_rework_required") {
				goalStatusOverride = "in_progress";
			} else {
				failedReasonOverride = (conFailed.reason as string) || "Consensus failed";
			}
		}
		return {
			finalizerAllowed: false,
			goalStatusOverride,
			...(blockedReasonOverride ? { blockedReasonOverride } : {}),
			failedReasonOverride,
		};
	}

	if (reworkCount >= 3) {
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

	return null;
}
