import { runCheckpointConsensusStep } from "./checkpoint-consensus-step.js";
import { reconcileCheckpointSnapshot } from "./checkpoint-reconciliation.js";
import { appendRunEvent, readRunEvents } from "./control-plane.js";
import { assertGroundTruthEvidence } from "./evidence-completion-gate.js";
import { collectLspDiagnostics, collectRulesViolations } from "./lsp-rules-feedback.js";
import { normalizeUlwLoopSessionId, resolveUlwLoopSessionIdFromEnv } from "./paths.js";
import { checkStagnation, loadStagnationPolicy } from "./stagnation-guard.js";
import { calculateQualityFingerprint, loadVerificationPolicy, runVerificationPipeline, } from "./verification-pipeline.js";
export async function runCheckpointQualityGate(repoRoot, goal, plan, evidence, args, now, scope) {
    const runId = normalizeUlwLoopSessionId(scope?.sessionId) ?? resolveUlwLoopSessionIdFromEnv() ?? "default-run";
    const events = await readRunEvents(repoRoot, runId);
    const stagnationPolicy = await loadStagnationPolicy(repoRoot);
    const stag = checkStagnation(events, stagnationPolicy);
    if (stag.status !== "ok" &&
        stag.payload &&
        !events.some((e) => e.type === "parent.stagnation_detected" && e.fingerprint === stag.payload?.fingerprint)) {
        await appendRunEvent(repoRoot, runId, "parent.stagnation_detected", {
            ...stag.payload,
            fingerprint: stag.payload.fingerprint,
        });
    }
    const completed = events.filter((e) => e.type === "agent.completed_reported");
    const subResult = completed[completed.length - 1]?.result;
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
    const evidenceEnvelope = {
        goal: goal.objective,
        summary: evidence || subResult?.summary || "",
        filesChanged,
        commandsRun,
        testResults: commandsRun.filter((c) => /test/i.test(c)),
        artifactsGenerated,
        completedRoles,
        acknowledgedRoles,
        dryRunSafety: true,
    };
    const fingerprint = calculateQualityFingerprint(evidenceEnvelope);
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
        const conFailed = events.find((e) => (e.type === "quality_gate.consensus_failed" ||
            e.type === "quality_gate.consensus_inconclusive" ||
            e.type === "quality_gate.consensus_rework_required") &&
            e.qualityInputFingerprint === fingerprint);
        let goalStatusOverride = "failed";
        let blockedReasonOverride;
        let failedReasonOverride = failEvent.reason || "Verification pipeline failed";
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
    await appendRunEvent(repoRoot, runId, "quality_gate.started", { qualityInputFingerprint: fingerprint });
    const lspDiagnostics = await collectLspDiagnostics(repoRoot, filesChanged);
    const rulesViolations = await collectRulesViolations(repoRoot, filesChanged);
    const isSec = /\b(security|auth|login|password|encrypt|token|credential|permission)\b/i.test(`${goal.objective} ${evidence}`);
    const isPub = /\b(release|publish|deploy|production|public)\b/i.test(`${goal.objective} ${evidence}`);
    const isDest = /\b(delete|remove|destroy|drop|truncate|destructive)\b/i.test(`${goal.objective} ${evidence}`);
    let riskLevel = "low";
    if (isSec || isPub || isDest || filesChanged.length > 5 || lspDiagnostics.length > 0 || rulesViolations.length > 0)
        riskLevel = "high";
    else if (filesChanged.length > 2)
        riskLevel = "medium";
    const ctx = {
        runId,
        events,
        evidence: evidenceEnvelope,
        goal: goal.objective,
        wouldSwitchModel: false,
        isDryRun: true,
        riskLevel,
        destructiveChange: isDest,
        publicRelease: isPub,
        securitySensitive: isSec,
        lspDiagnostics,
        rulesViolations,
    };
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
        return {
            finalizerAllowed: false,
            goalStatusOverride: "failed",
            failedReasonOverride: sem.reason || "Semantic check failed",
        };
    }
    await appendRunEvent(repoRoot, runId, "quality_gate.mechanical_passed", { qualityInputFingerprint: fingerprint });
    let finalizerAllowed = true;
    let goalStatusOverride;
    let blockedReasonOverride;
    let failedReasonOverride;
    if (con?.status === "required") {
        await appendRunEvent(repoRoot, runId, "quality_gate.consensus_required", {
            reason: con.reason || "Consensus required due to policy triggers",
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
    try {
        await assertGroundTruthEvidence(repoRoot, args.qualityGateJson, events, evidenceEnvelope);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[debug-ground-truth] ${reason}`);
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
