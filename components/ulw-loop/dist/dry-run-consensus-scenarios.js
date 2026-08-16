export async function runConsensusStaticScenario(scenario, ctx, state) {
    if (!scenario.startsWith("consensus-") || scenario === "consensus-live-invocation")
        return false;
    state.isQualityScenario = true;
    state.qualityStage = "consensus";
    if (scenario === "consensus-happy-path") {
        state.qualityStatus = "passed";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-happy-path...\n`);
            process.stdout.write(`[Dry-Run] All personas (advocate, devils_advocate, regression_reviewer, security_state_reviewer) approved.\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_passed (finalizerAllowed=true)\n`);
        }
    }
    else if (scenario === "consensus-devil-rejects") {
        state.qualityStatus = "failed";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-devil-rejects...\n`);
            process.stdout.write(`[Dry-Run] Persona devils_advocate rejected.\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_failed (finalizerAllowed=false)\n`);
        }
    }
    else if (scenario === "consensus-regression-risk") {
        state.qualityStatus = "rework_required";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-regression-risk...\n`);
            process.stdout.write(`[Dry-Run] Persona regression_reviewer requested needs_rework.\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_rework_required (finalizerAllowed=false)\n`);
        }
    }
    else if (scenario === "consensus-security-state-risk") {
        state.qualityStatus = "failed";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-security-state-risk...\n`);
            process.stdout.write(`[Dry-Run] Persona security_state_reviewer rejected.\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_failed (finalizerAllowed=false)\n`);
        }
    }
    else if (scenario === "consensus-inconclusive") {
        state.qualityStatus = "inconclusive";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-inconclusive...\n`);
            process.stdout.write(`[Dry-Run] Consensus results are inconclusive.\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_inconclusive (parentActionRequired=true)\n`);
        }
    }
    else if (scenario === "consensus-self-finalizes-rejected") {
        state.qualityStatus = "failed";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-self-finalizes-rejected...\n`);
            process.stdout.write(`[Dry-Run] Consensus subagent envelope validation failed: consensus subagents cannot finalize run or directly assert run.completed/failed.\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_failed (finalizerAllowed=false)\n`);
        }
    }
    else if (scenario === "consensus-dispatcher-runtime") {
        state.qualityStatus = "passed";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-dispatcher-runtime...\n`);
            await import("./cli-control-plane.js");
            process.stdout.write(`[Dry-Run] Invoking dispatchConsensusCmd...\n`);
            process.stdout.write(`[Dry-Run] Invoking reportConsensusResultCmd for 4 personas...\n`);
            process.stdout.write(`[Dry-Run] Invoking aggregateConsensusCmd...\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_passed (finalizerAllowed=true)\n`);
        }
    }
    else if (scenario === "consensus-dispatch-invalid-envelope") {
        state.qualityStatus = "failed";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-dispatch-invalid-envelope...\n`);
            process.stdout.write(`[Dry-Run] Subagent attempts to submit envelope with mayFinalizeRun=true.\n`);
            process.stdout.write(`[Dry-Run] Envelope rejected by validateConsensusResultEnvelope.\n`);
            process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_failed (finalizerAllowed=false)\n`);
        }
    }
    else if (scenario === "consensus-dispatch-antigravity-inherits-model") {
        state.qualityStatus = "passed";
        if (!ctx.json) {
            process.stdout.write(`[Dry-Run] Initializing consensus-dispatch-antigravity-inherits-model...\n`);
            process.stdout.write(`[Dry-Run] Dispatcher creates role envelopes with wouldSwitchModel: false.\n`);
            process.stdout.write(`[Dry-Run] Antigravity policy satisfied.\n`);
        }
    }
    return true;
}
