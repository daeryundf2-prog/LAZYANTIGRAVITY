export function dispatchStagnationQualityScenario(scenario, ctx, state) {
    if (scenario === "same-error-loop") {
        sameErrorLoop(ctx, state);
        return true;
    }
    if (scenario === "oscillating-patch") {
        oscillatingPatch(ctx, state);
        return true;
    }
    if (scenario === "heartbeat-only-stall") {
        heartbeatOnlyStall(ctx, state);
        return true;
    }
    if (scenario === "no-evidence-progress") {
        noEvidenceProgress(ctx, state);
        return true;
    }
    if (scenario === "quality-happy-path") {
        qualityHappyPath(ctx, state);
        return true;
    }
    if (scenario === "quality-mechanical-fail") {
        qualityMechanicalFail(ctx, state);
        return true;
    }
    if (scenario === "quality-semantic-insufficient-evidence") {
        qualitySemanticInsufficientEvidence(ctx, state);
        return true;
    }
    if (scenario === "quality-consensus-required") {
        qualityConsensusRequired(ctx, state);
        return true;
    }
    if (scenario === "quality-stagnation-unresolved") {
        qualityStagnationUnresolved(ctx, state);
        return true;
    }
    if (scenario === "hitl-scenario") {
        hitlScenario(ctx, state);
        return true;
    }
    return false;
}
function sameErrorLoop(ctx, state) {
    state.completedRoles = ["planner"];
    state.failedRole = null;
    state.nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing same-error-loop scenario...\n`);
        process.stdout.write(`[Dry-Run] Subagent worker repeatedly failing with identical errors.\n`);
        process.stdout.write(`[Dry-Run] StagnationGuard triggered: same_error_loop\n`);
        process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
    }
}
function oscillatingPatch(ctx, state) {
    state.completedRoles = ["planner"];
    state.failedRole = null;
    state.nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing oscillating-patch scenario...\n`);
        process.stdout.write(`[Dry-Run] Subagent generating A/B/A/B alternating patches.\n`);
        process.stdout.write(`[Dry-Run] StagnationGuard triggered: oscillation_detected\n`);
        process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
    }
}
function heartbeatOnlyStall(ctx, state) {
    state.completedRoles = ["planner"];
    state.failedRole = null;
    state.nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing heartbeat-only-stall scenario...\n`);
        process.stdout.write(`[Dry-Run] Subagent sending heartbeats but no progress.\n`);
        process.stdout.write(`[Dry-Run] StagnationGuard triggered: heartbeat_only_stall\n`);
        process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
    }
}
function noEvidenceProgress(ctx, state) {
    state.completedRoles = ["planner"];
    state.failedRole = null;
    state.nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing no-evidence-progress scenario...\n`);
        process.stdout.write(`[Dry-Run] Subagent reporting progress without actionable evidence.\n`);
        process.stdout.write(`[Dry-Run] StagnationGuard triggered: no_evidence_progress\n`);
        process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
    }
}
function qualityHappyPath(ctx, state) {
    state.isQualityScenario = true;
    state.qualityStatus = "passed";
    state.qualityStage = "all";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing quality-happy-path scenario...\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Mechanical PASSED\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Semantic PASSED\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Consensus SKIPPED\n`);
    }
}
function qualityMechanicalFail(ctx, state) {
    state.isQualityScenario = true;
    state.qualityStatus = "failed";
    state.qualityStage = "mechanical";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing quality-mechanical-fail scenario...\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Mechanical FAILED (No commands run to verify changes)\n`);
    }
}
function qualitySemanticInsufficientEvidence(ctx, state) {
    state.isQualityScenario = true;
    state.qualityStatus = "failed";
    state.qualityStage = "semantic";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing quality-semantic-insufficient-evidence scenario...\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Mechanical PASSED\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Semantic FAILED (Goal or evidence mismatch)\n`);
    }
}
function qualityConsensusRequired(ctx, state) {
    state.isQualityScenario = true;
    state.qualityStatus = "required";
    state.qualityStage = "consensus";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing quality-consensus-required scenario...\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Mechanical PASSED\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Semantic PASSED\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Consensus REQUIRED (riskLevel=high)\n`);
    }
}
function qualityStagnationUnresolved(ctx, state) {
    state.isQualityScenario = true;
    state.qualityStatus = "failed";
    state.qualityStage = "semantic";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing quality-stagnation-unresolved scenario...\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Mechanical PASSED\n`);
        process.stdout.write(`[Dry-Run] Quality Gate: Semantic FAILED (Unresolved stagnation detected)\n`);
    }
}
function hitlScenario(ctx, state) {
    state.completedRoles = ["planner"];
    state.failedRole = null;
    state.nextRecommendedAction = "User provides missing input or approves action, then run /ulw resume";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing hitl-scenario...\n`);
        process.stdout.write(`[Dry-Run] Hook execution returned HITL_REQUIRED.\n`);
        process.stdout.write(`[Dry-Run] Emitted parent.hitl_required event. RunState paused.\n`);
        process.stdout.write(`[Dry-Run] Waiting for parent.resumed to resolve HITL state.\n`);
    }
}
