import { existsSync, rmSync } from "node:fs";
import { getRunDir } from "./control-plane.js";
import { out } from "./dry-run-helpers.js";
export async function runConsensusLiveInvocation(ctx, state) {
    state.isQualityScenario = true;
    state.qualityStage = "consensus";
    state.qualityStatus = "passed";
    out(ctx.json, `Initializing consensus-live-invocation...`);
    const runId = `dry-run-live-${Date.now()}`;
    const runDir = getRunDir(ctx.repoRoot, runId);
    try {
        const { dispatchConsensus, setMockPersonaVerdict, reportConsensusResult, aggregateConsensus } = await import("./consensus-dispatcher.js");
        const { appendRunEvent, readRunEvents } = await import("./control-plane.js");
        if (!ctx.json)
            process.stdout.write(`[Dry-Run] Case 1: All personas approve...\n`);
        await appendRunEvent(ctx.repoRoot, runId, "run.created", {});
        setMockPersonaVerdict("advocate", "approve");
        setMockPersonaVerdict("devils_advocate", "approve");
        setMockPersonaVerdict("regression_reviewer", "approve");
        setMockPersonaVerdict("security_state_reviewer", "approve");
        const resApprove = await dispatchConsensus(ctx.repoRoot, runId, "test-fp-approve", {
            mockLive: true,
            prompt: "Simulated task",
        });
        const events1 = await readRunEvents(ctx.repoRoot, runId);
        const passedEvent = events1.find((e) => e.type === "quality_gate.consensus_passed" && e.consensusId === resApprove.consensusId);
        if (!passedEvent?.finalizerAllowed || !passedEvent.isMockLive) {
            throw new Error("Case 1 (Approve) validation failed in Dry-Run");
        }
        if (!ctx.json)
            process.stdout.write(`[Dry-Run] Case 2: Devil's Advocate rejects...\n`);
        setMockPersonaVerdict("advocate", "approve");
        setMockPersonaVerdict("devils_advocate", "reject");
        setMockPersonaVerdict("regression_reviewer", "approve");
        setMockPersonaVerdict("security_state_reviewer", "approve");
        const resReject = await dispatchConsensus(ctx.repoRoot, runId, "test-fp-reject", {
            mockLive: true,
            prompt: "Simulated task",
        });
        const events2 = await readRunEvents(ctx.repoRoot, runId);
        const failedEvent = events2.find((e) => e.type === "quality_gate.consensus_failed" && e.consensusId === resReject.consensusId);
        if (!failedEvent || failedEvent.finalizerAllowed) {
            throw new Error("Case 2 (Reject) validation failed in Dry-Run");
        }
        if (!ctx.json)
            process.stdout.write(`[Dry-Run] Case 3: Regression Reviewer requires rework...\n`);
        setMockPersonaVerdict("advocate", "approve");
        setMockPersonaVerdict("devils_advocate", "approve");
        setMockPersonaVerdict("regression_reviewer", "needs_rework");
        setMockPersonaVerdict("security_state_reviewer", "approve");
        const resRework = await dispatchConsensus(ctx.repoRoot, runId, "test-fp-rework", {
            mockLive: true,
            prompt: "Simulated task",
        });
        const events3 = await readRunEvents(ctx.repoRoot, runId);
        const reworkEvent = events3.find((e) => e.type === "quality_gate.consensus_rework_required" && e.consensusId === resRework.consensusId);
        if (!reworkEvent || reworkEvent.finalizerAllowed) {
            throw new Error("Case 3 (Rework) validation failed in Dry-Run");
        }
        if (!ctx.json)
            process.stdout.write(`[Dry-Run] Case 4: Persona times out...\n`);
        setMockPersonaVerdict("advocate", "approve");
        setMockPersonaVerdict("devils_advocate", "approve");
        setMockPersonaVerdict("regression_reviewer", "approve");
        setMockPersonaVerdict("security_state_reviewer", "inconclusive");
        const resTimeout = await dispatchConsensus(ctx.repoRoot, runId, "test-fp-timeout", {
            mockLive: true,
            prompt: "Simulated task",
        });
        const events4 = await readRunEvents(ctx.repoRoot, runId);
        const incEvent = events4.find((e) => e.type === "quality_gate.consensus_inconclusive" && e.consensusId === resTimeout.consensusId);
        if (!incEvent || incEvent.finalizerAllowed || !incEvent.parentActionRequired) {
            throw new Error("Case 4 (Timeout) validation failed in Dry-Run");
        }
        if (!ctx.json)
            process.stdout.write(`[Dry-Run] Case 5: Invalid Envelope submitted...\n`);
        setMockPersonaVerdict("advocate", "approve");
        setMockPersonaVerdict("devils_advocate", "approve");
        setMockPersonaVerdict("regression_reviewer", "approve");
        setMockPersonaVerdict("security_state_reviewer", "invalid_envelope");
        const resInvalid = await dispatchConsensus(ctx.repoRoot, runId, "test-fp-invalid", {
            mockLive: true,
            prompt: "Simulated task",
        });
        const events5 = await readRunEvents(ctx.repoRoot, runId);
        const invalidIncEvent = events5.find((e) => e.type === "quality_gate.consensus_inconclusive" && e.consensusId === resInvalid.consensusId);
        if (!invalidIncEvent || invalidIncEvent.finalizerAllowed) {
            throw new Error("Case 5 (Invalid Envelope) validation failed in Dry-Run");
        }
        if (!ctx.json)
            process.stdout.write(`[Dry-Run] Case 6: Duplicate Same Payload reported...\n`);
        setMockPersonaVerdict("advocate", "approve");
        setMockPersonaVerdict("devils_advocate", "approve");
        setMockPersonaVerdict("regression_reviewer", "approve");
        setMockPersonaVerdict("security_state_reviewer", "approve");
        const resDup = await dispatchConsensus(ctx.repoRoot, runId, "test-fp-dup", {
            mockLive: true,
            prompt: "Simulated task",
        });
        const eventsDup = await readRunEvents(ctx.repoRoot, runId);
        const originalAdvocateEvent = eventsDup.find((e) => e.type === "quality_gate.consensus_persona_reported" &&
            e.consensusId === resDup.consensusId &&
            e.persona === "advocate");
        if (!originalAdvocateEvent)
            throw new Error("Original advocate event not found");
        const dupAgentId = originalAdvocateEvent.agentId;
        const dupEnvelope = {
            runId,
            consensusId: resDup.consensusId,
            agentId: dupAgentId,
            persona: "advocate",
            verdict: "approve",
            reason: `Mock consensus response for advocate with verdict approve`,
            requiresParentAck: true,
        };
        await reportConsensusResult(ctx.repoRoot, runId, resDup.consensusId, dupAgentId, dupEnvelope, true);
        if (!ctx.json)
            process.stdout.write(`[Dry-Run] Case 7: Duplicate Conflicting Payload reported...\n`);
        const resConflict = await dispatchConsensus(ctx.repoRoot, runId, "test-fp-conflict", { mockLive: false });
        const conflictAgentId = `advocate-${resConflict.consensusId.substring(0, 8)}`;
        const envelope1 = {
            runId,
            consensusId: resConflict.consensusId,
            agentId: conflictAgentId,
            persona: "advocate",
            verdict: "approve",
            reason: `Mock consensus response for advocate with verdict approve`,
            requiresParentAck: true,
        };
        await reportConsensusResult(ctx.repoRoot, runId, resConflict.consensusId, conflictAgentId, envelope1, true);
        const conflictEnvelope = {
            ...envelope1,
            verdict: "reject",
        };
        let conflictThrown = false;
        try {
            await reportConsensusResult(ctx.repoRoot, runId, resConflict.consensusId, conflictAgentId, conflictEnvelope, true);
        }
        catch (err) {
            if (err instanceof Error && err.message.includes("Conflict")) {
                conflictThrown = true;
            }
        }
        if (!conflictThrown) {
            throw new Error("Case 7 (Conflict) validation failed in Dry-Run: No conflict error thrown");
        }
        await aggregateConsensus(ctx.repoRoot, runId, resConflict.consensusId);
        const events7 = await readRunEvents(ctx.repoRoot, runId);
        const conflictPassed = events7.find((e) => e.type === "quality_gate.consensus_passed" && e.consensusId === resConflict.consensusId);
        const conflictFailed = events7.find((e) => e.type === "quality_gate.consensus_failed" && e.consensusId === resConflict.consensusId);
        if (conflictPassed) {
            throw new Error("Case 7 validation failed in Dry-Run: aggregateConsensus passed despite conflict");
        }
        if (!conflictFailed || conflictFailed.finalizerAllowed) {
            throw new Error("Case 7 validation failed in Dry-Run: aggregateConsensus did not block finalizer on conflict");
        }
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Live invocation mock run simulated successfully.\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_passed (finalizerAllowed=true)\n`);
        }
    }
    finally {
        if (existsSync(runDir)) {
            rmSync(runDir, { recursive: true, force: true });
        }
    }
}
