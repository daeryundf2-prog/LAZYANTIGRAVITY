import { saveDryRunCheckpoint } from "./dry-run-helpers.js";
export async function dispatchErrorScenario(scenario, ctx, state) {
    if (scenario === "happy-path") {
        happyPath(ctx, state);
        return true;
    }
    if (scenario === "quota-opus-exhausted") {
        await quotaOpusExhausted(ctx, state);
        return true;
    }
    if (scenario === "context-window-exceeded") {
        await contextWindowExceeded(ctx, state);
        return true;
    }
    if (scenario === "output-token-limit") {
        await outputTokenLimit(ctx, state);
        return true;
    }
    if (scenario === "provider-unavailable") {
        await providerUnavailable(ctx, state);
        return true;
    }
    return false;
}
function happyPath(ctx, state) {
    state.completedRoles = [...ctx.allRoles];
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: happy-path)...\n`);
        process.stdout.write(`[Dry-Run] Antigravity Model Recommendation:\n`);
        process.stdout.write(`  - Gemini 3.7 Flash (High) - session default (plan + code)\n`);
        process.stdout.write(`  - Gemini 3.7 Flash (Medium) - rapid iterative fixes\n`);
        process.stdout.write(`  - Gemini 3.1 Pro (High) - cross-model verification\n`);
        process.stdout.write(`  - Claude Opus 4.6 (Thinking) - escape hatch only\n`);
        process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner)\n`);
        process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher)\n`);
        process.stdout.write(`[Dry-Run] Running role: worker (would invoke: self / Hephaestus Worker)\n`);
        process.stdout.write(`[Dry-Run] Running role: verifier (would invoke: self / Oracle Reviewer)\n`);
        process.stdout.write(`[Dry-Run] Running role: finalizer (would run in parent agent)\n`);
        process.stdout.write(`[Dry-Run] Happy-path complete successfully!\n`);
    }
}
async function quotaOpusExhausted(ctx, state) {
    state.completedRoles = ["planner", "researcher"];
    state.failedRole = "worker";
    state.errorType = "model_rate_limited";
    state.nextRecommendedAction = "Switch to Gemini 3.7 Flash (High) in Antigravity UI and run /ulw resume";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: quota-opus-exhausted)...\n`);
        process.stdout.write(`[Dry-Run] Antigravity Model Recommendation:\n`);
        process.stdout.write(`  - Gemini 3.7 Flash (High) - session default (plan + code)\n`);
        process.stdout.write(`  - Gemini 3.7 Flash (Medium) - rapid iterative fixes\n`);
        process.stdout.write(`  - Gemini 3.1 Pro (High) - cross-model verification\n`);
        process.stdout.write(`  - Claude Opus 4.6 (Thinking) - escape hatch only\n`);
        process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
        process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - SUCCESS\n`);
        process.stdout.write(`[Dry-Run] Running role: worker (would invoke: self / Hephaestus Worker) - FAILED\n`);
        process.stdout.write(`[Dry-Run] Error: model_rate_limited (Claude Opus 4.6 Thinking quota exhausted)\n`);
        process.stdout.write(`[Dry-Run] Quota/Rate limit detected in Antigravity: Immediately stopping loop.\n`);
        process.stdout.write(`[Dry-Run] Fallback Recommendation: Switch to Gemini 3.7 Flash (High) in Antigravity UI and run /ulw resume.\n`);
        process.stdout.write(`[Dry-Run] Automatic model switching: Disabled (wouldSwitchModel: false)\n`);
    }
    await saveDryRunCheckpoint(ctx, state, "dry-run-task-quota");
    return true;
}
async function contextWindowExceeded(ctx, state) {
    state.completedRoles = ["planner"];
    state.failedRole = "researcher";
    state.errorType = "context_window_exceeded";
    state.nextRecommendedAction = "Switch to Gemini 3.7 Flash (High) and run /ulw resume in Compact Mode";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: context-window-exceeded)...\n`);
        process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
        process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - FAILED\n`);
        process.stdout.write(`[Dry-Run] Error: context_window_exceeded\n`);
        process.stdout.write(`[Dry-Run] Transitioning to Compact Mode: Summarizing logs, using relevant slices of files, and referencing large outputs via paths.\n`);
    }
    await saveDryRunCheckpoint(ctx, state, "dry-run-task-context");
    return true;
}
async function outputTokenLimit(ctx, state) {
    state.completedRoles = ["planner", "researcher"];
    state.failedRole = "worker";
    state.errorType = "output_token_limit";
    state.nextRecommendedAction = "Enable Batch Mode, split edits into smaller patch batches, and run /ulw resume";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: output-token-limit)...\n`);
        process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
        process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - SUCCESS\n`);
        process.stdout.write(`[Dry-Run] Running role: worker (would invoke: self / Hephaestus Worker) - FAILED\n`);
        process.stdout.write(`[Dry-Run] Error: output_token_limit\n`);
        process.stdout.write(`[Dry-Run] Transitioning to Batch Mode: Dividing changes into multiple smaller patch batches and validating incrementally.\n`);
    }
    await saveDryRunCheckpoint(ctx, state, "dry-run-task-output");
    return true;
}
async function providerUnavailable(ctx, state) {
    state.completedRoles = ["planner"];
    state.failedRole = "researcher";
    state.errorType = "provider_unavailable";
    state.nextRecommendedAction = "Wait for provider endpoint recovery or check network status, then run /ulw resume";
    if (!ctx.json) {
        process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: provider-unavailable)...\n`);
        process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
        process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - FAILED\n`);
        process.stdout.write(`[Dry-Run] Error: provider_unavailable (API Endpoint Down)\n`);
        process.stdout.write(`[Dry-Run] Preventing infinite retry loops: Halting execution. Recommended fallback or wait before re-trying.\n`);
    }
    await saveDryRunCheckpoint(ctx, state, "dry-run-task-provider");
    return true;
}
