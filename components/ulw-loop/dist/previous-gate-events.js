import { reconcileCheckpointSnapshot } from "./checkpoint-reconciliation.js";
import { appendRunEvent } from "./control-plane.js";
import { assertGroundTruthEvidence } from "./evidence-completion-gate.js";
const CONSENSUS_FAILED_TYPES = new Set([
    "quality_gate.consensus_failed",
    "quality_gate.consensus_inconclusive",
    "quality_gate.consensus_rework_required",
]);
export async function checkPriorGateEvents(repoRoot, runId, events, fingerprint, plan, goal, evidence, evidenceEnvelope, now, args, scope) {
    const passEvent = events.find((e) => e.type === "quality_gate.completed" && e.qualityInputFingerprint === fingerprint);
    if (passEvent) {
        await assertGroundTruthEvidence(repoRoot, args.qualityGateJson, events, evidenceEnvelope);
        return {
            finalizerAllowed: true,
            ...(await reconcileCheckpointSnapshot(repoRoot, plan, goal, evidence, now, args, scope)),
        };
    }
    const failEvent = events.find((e) => e.type === "quality_gate.failed" && e.qualityInputFingerprint === fingerprint);
    if (failEvent) {
        const lastMech = events.find((e) => e.type === "quality_gate.mechanical_failed" && e.qualityInputFingerprint === fingerprint);
        const conFailed = events.find((e) => CONSENSUS_FAILED_TYPES.has(e.type) && e.qualityInputFingerprint === fingerprint);
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
    const reworks = events.filter((e) => e.type === "quality_gate.consensus_rework_required" && e.qualityInputFingerprint === fingerprint);
    if (reworks.length >= 3) {
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
