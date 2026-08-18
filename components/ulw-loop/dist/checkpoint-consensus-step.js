import { dispatchConsensus } from "./consensus-dispatcher.js";
import { appendRunEvent, readRunEvents } from "./control-plane.js";
import { injectFeedbackContext } from "./lsp-rules-feedback.js";
export async function runCheckpointConsensusStep(repoRoot, runId, fingerprint, goal, lspDiagnostics, rulesViolations) {
    const consensusPrompt = injectFeedbackContext(`Verify the changes for goal: ${goal.objective}`, lspDiagnostics, rulesViolations);
    const isLiveAvailable = !!process.env["OPENCODE_API_URL"] || !!process.env["LAZYANTIGRAVITY_LIVE_CONSENSUS"];
    const isTestEnv = process.env["NODE_ENV"] === "test" || process.env["VITEST"] === "true";
    const dispatchRes = await dispatchConsensus(repoRoot, runId, fingerprint, {
        live: isLiveAvailable,
        mockLive: !isLiveAvailable && isTestEnv,
        prompt: consensusPrompt,
    });
    const updatedEvents = await readRunEvents(repoRoot, runId);
    const termEvent = updatedEvents.find((e) => (e.type === "quality_gate.consensus_passed" || e.type === "quality_gate.consensus_failed" || e.type === "quality_gate.consensus_rework_required" || e.type === "quality_gate.consensus_inconclusive") &&
        e.consensusId === dispatchRes.consensusId);
    if (termEvent) {
        if (termEvent.type === "quality_gate.consensus_passed") {
            return { finalizerAllowed: true };
        }
        if (termEvent.type === "quality_gate.consensus_inconclusive") {
            await appendRunEvent(repoRoot, runId, "parent.hitl_required", { reason: "Consensus inconclusive: User decision required", qualityInputFingerprint: fingerprint });
            return { finalizerAllowed: false, goalStatusOverride: "needs_user_decision", blockedReasonOverride: termEvent.reason || "Consensus inconclusive" };
        }
        if (termEvent.type === "quality_gate.consensus_rework_required") {
            return { finalizerAllowed: false, goalStatusOverride: "in_progress" };
        }
        return { finalizerAllowed: false, goalStatusOverride: "failed", failedReasonOverride: termEvent.reason || "Consensus failed" };
    }
    return { finalizerAllowed: false, goalStatusOverride: "needs_user_decision", blockedReasonOverride: "Consensus could not resolve terminal state" };
}
