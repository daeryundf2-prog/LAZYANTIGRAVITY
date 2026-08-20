import { runCheckpointConsensusStep } from "./checkpoint-consensus-step.js";
import { reconcileCheckpointSnapshot } from "./checkpoint-reconciliation.js";
import { appendRunEvent, readRunEvents } from "./control-plane.js";
import { collectLspDiagnostics, collectRulesViolations } from "./lsp-rules-feedback.js";
import { normalizeUlwLoopSessionId, resolveUlwLoopSessionIdFromEnv } from "./paths.js";
import { checkStagnation, loadStagnationPolicy } from "./stagnation-guard.js";
import { calculateQualityFingerprint, loadVerificationPolicy, runVerificationPipeline, } from "./verification-pipeline.js";
export async function runCheckpointQualityGate(repoRoot, goal, plan, evidence, args, now, scope) {
    const runId = normalizeUlwLoopSessionId(scope?.sessionId) ?? resolveUlwLoopSessionIdFromEnv() ?? "default-run";
    const events = await readRunEvents(repoRoot, runId);
    const stagnationPolicy = await loadStagnationPolicy(repoRoot);
    const stagnationResult = checkStagnation(events, stagnationPolicy);
    if (stagnationResult.status !== "ok") {
        const payload = stagnationResult.payload;
        if (payload &&
            !events.some((e) => e.type === "parent.stagnation_detected" && e.fingerprint === payload.fingerprint)) {
            await appendRunEvent(repoRoot, runId, "parent.stagnation_detected", {
                ...payload,
                fingerprint: payload.fingerprint,
            });
        }
    }
    const completedEvents = events.filter((e) => e.type === "agent.completed_reported");
    const latestCompleted = completedEvents[completedEvents.length - 1];
    const subagentResult = latestCompleted?.result;
    const acknowledgedEvents = events.filter((e) => e.type === "parent.acknowledged");
    const isAcknowledged = acknowledgedEvents.some((e) => e.agentId === subagentResult?.agentId);
    if (!isAcknowledged && subagentResult?.agentId) {
        await appendRunEvent(repoRoot, runId, "parent.acknowledged", { agentId: subagentResult.agentId });
    }
    const filesChanged = subagentResult?.filesChanged || [];
    const commandsRun = subagentResult?.commandsRun || [];
    const artifactsGenerated = subagentResult?.artifactsGenerated || [];
    const completedRoles = subagentResult ? [subagentResult.role] : [];
    const acknowledgedRoles = isAcknowledged && subagentResult ? [subagentResult.role] : [];
    const evidenceEnvelope = {
        goal: goal.objective,
        summary: evidence || subagentResult?.summary || "",
        filesChanged,
        commandsRun,
        testResults: commandsRun.filter((c) => /test/i.test(c)),
        artifactsGenerated,
        completedRoles,
        acknowledgedRoles,
        dryRunSafety: true,
    };
    const fingerprint = calculateQualityFingerprint(evidenceEnvelope);
    const existingPass = events.find((e) => e.type === "quality_gate.completed" && e.qualityInputFingerprint === fingerprint);
    if (existingPass) {
        const reconciled = await reconcileCheckpointSnapshot(repoRoot, plan, goal, evidence, now, args, scope);
        return { finalizerAllowed: true, ...reconciled };
    }
    const existingFailure = events.find((e) => e.type === "quality_gate.failed" && e.qualityInputFingerprint === fingerprint);
    if (existingFailure) {
        const lastMech = events.find((e) => e.type === "quality_gate.mechanical_failed" && e.qualityInputFingerprint === fingerprint);
        const conFailed = events.find((e) => (e.type === "quality_gate.consensus_failed" ||
            e.type === "quality_gate.consensus_inconclusive" ||
            e.type === "quality_gate.consensus_rework_required") &&
            e.qualityInputFingerprint === fingerprint);
        let goalStatusOverride = "failed";
        let blockedReasonOverride;
        let failedReasonOverride = existingFailure.reason || "Verification pipeline failed";
        if (lastMech)
            failedReasonOverride = lastMech.reason || "Mechanical check failed";
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
            ...(blockedReasonOverride !== undefined ? { blockedReasonOverride } : {}),
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
    await appendRunEvent(repoRoot, runId, "quality_gate.started", { qualityInputFingerprint: fingerprint });
    const lspDiagnostics = await collectLspDiagnostics(repoRoot, filesChanged);
    const rulesViolations = await collectRulesViolations(repoRoot, filesChanged);
    const isSecuritySensitive = /\b(security|auth|login|password|encrypt|token|credential|permission)\b/i.test(`${goal.objective} ${evidence}`);
    const isPublicRelease = /\b(release|publish|deploy|production|public)\b/i.test(`${goal.objective} ${evidence}`);
    const isDestructive = /\b(delete|remove|destroy|drop|truncate|destructive)\b/i.test(`${goal.objective} ${evidence}`);
    let riskLevel = "low";
    if (isSecuritySensitive ||
        isPublicRelease ||
        isDestructive ||
        filesChanged.length > 5 ||
        lspDiagnostics.length > 0 ||
        rulesViolations.length > 0) {
        riskLevel = "high";
    }
    else if (filesChanged.length > 2) {
        riskLevel = "medium";
    }
    const ctx = {
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
    let goalStatusOverride;
    let blockedReasonOverride;
    let failedReasonOverride;
    if (conResult?.status === "required") {
        await appendRunEvent(repoRoot, runId, "quality_gate.consensus_required", {
            reason: conResult.reason || "Consensus required due to policy triggers",
            qualityInputFingerprint: fingerprint,
        });
        const conStep = await runCheckpointConsensusStep(repoRoot, runId, fingerprint, goal, lspDiagnostics, rulesViolations);
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
        return {
            finalizerAllowed: false,
            ...(goalStatusOverride !== undefined ? { goalStatusOverride } : {}),
            ...(blockedReasonOverride !== undefined ? { blockedReasonOverride } : {}),
            ...(failedReasonOverride !== undefined ? { failedReasonOverride } : {}),
        };
    }
    const reconciled = await reconcileCheckpointSnapshot(repoRoot, plan, goal, evidence, now, args, scope);
    await appendRunEvent(repoRoot, runId, "quality_gate.completed", { qualityInputFingerprint: fingerprint });
    return { finalizerAllowed: true, ...reconciled };
}
