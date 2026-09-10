import { reconcileCheckpointSnapshot } from "./checkpoint-reconciliation.js";
import { appendRunEvent } from "./control-plane.js";
import { assertGroundTruthEvidence } from "./evidence-completion-gate.js";
const CONSENSUS_FAILED_TYPES = new Set([
    "quality_gate.consensus_failed",
    "quality_gate.consensus_inconclusive",
    "quality_gate.consensus_rework_required",
]);
export async function checkPriorGateEvents(repoRoot, runId, events, fingerprint, plan, goal, evidence, evidenceEnvelope, now, args, scope) {
    let passEvent;
    let failEvent;
    let lastMech;
    let conFailed;
    let reworkCount = 0;
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (!e || e.qualityInputFingerprint !== fingerprint)
            continue;
        if (!passEvent && e.type === "quality_gate.completed")
            passEvent = e;
        if (!failEvent && e.type === "quality_gate.failed")
            failEvent = e;
        if (!lastMech && e.type === "quality_gate.mechanical_failed")
            lastMech = e;
        if (!conFailed && CONSENSUS_FAILED_TYPES.has(e.type))
            conFailed = e;
        if (e.type === "quality_gate.consensus_rework_required")
            reworkCount++;
    }
    if (passEvent) {
        await assertGroundTruthEvidence(repoRoot, args.qualityGateJson, events, evidenceEnvelope);
        return {
            finalizerAllowed: true,
            ...(await reconcileCheckpointSnapshot(repoRoot, plan, goal, evidence, now, args, scope)),
        };
    }
    if (failEvent) {
        let goalStatusOverride = "failed";
        let blockedReasonOverride;
        let failedReasonOverride = failEvent.reason || "Verification pipeline failed";
        if (lastMech) {
            failedReasonOverride = lastMech.reason || "Mechanical check failed";
        }
        else if (conFailed) {
            if (conFailed.type === "quality_gate.consensus_inconclusive") {
                goalStatusOverride = "needs_user_decision";
                blockedReasonOverride = conFailed.reason || "Consensus inconclusive";
            }
            else if (conFailed.type === "quality_gate.consensus_rework_required") {
                goalStatusOverride = "in_progress";
            }
            else {
                failedReasonOverride = conFailed.reason || "Consensus failed";
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
