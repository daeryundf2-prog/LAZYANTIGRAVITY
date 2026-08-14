import { existsSync, rmSync } from "node:fs";
import { printJson } from "./cli-output.js";
import { appendRunEvent, checkLeases, getRunDir, reconstructStateFromEvents, registerPoller, validateResultEnvelope, } from "./control-plane.js";
import { saveRoleCheckpoint } from "./role-checkpoint.js";
export async function dryRunCmd(repoRoot, argv, json) {
    if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
        const usage = `Usage:
  omo ulw-loop dry-run [--scenario <scenario>] [--json] [--write-checkpoint | --persist-checkpoint]

Scenarios:
  happy-path                 Simulates a fully successful role execution flow without errors
  quota-opus-exhausted       Simulates a Claude Opus quota exhausted / model_rate_limited failure
  context-window-exceeded    Simulates context window limit hit with Compact Mode transition
  output-token-limit         Simulates output token limit hit with Batch Mode transition
  provider-unavailable       Simulates provider API endpoint down with retry mitigation
  subagent-self-finalizes    Simulates subagent attempting to self-finalize the global run
  stale-heartbeat-missed     Simulates a subagent lease expiration transitioning to stale_candidate
  polling-loop-prevented     Simulates prevention of multiple active pollers on a run
  parent-progress-reconstruct Reconstructs run progress from an events ledger file
  subagent-wrong-role-envelope Simulates rejection of a subagent with mismatched role envelope
  same-error-loop            Simulates a subagent stuck in an identical error loop
  oscillating-patch          Simulates a subagent generating A/B/A/B alternating patches
  heartbeat-only-stall       Simulates a subagent sending heartbeats but no progress
  no-evidence-progress       Simulates a subagent reporting progress without actionable evidence
  quality-happy-path         Simulates passing all quality gates
  quality-mechanical-fail    Simulates a mechanical gate failure (no tests run)
  quality-semantic-insufficient-evidence Simulates a semantic gate failure (empty goal or evidence mismatch)
  quality-consensus-required Simulates high risk condition requiring consensus
  quality-stagnation-unresolved Simulates semantic failure due to unresolved stagnation
  hitl-scenario              Simulates a Human-in-the-Loop intervention requirement
  rewind-preview             Preview the result of a rewind operation
  rewind-create-branch       Simulates an append-only branch creation
  rewind-destructive-requires-flag Simulates requiring the destructive flag
  rewind-invalid-event-id    Simulates rewinding to a non-existent event
  rewind-preserves-original-ledger Simulates preserving original ledger
  consensus-happy-path       Simulates all personas approving
  consensus-devil-rejects    Simulates Devil's Advocate rejecting
  consensus-regression-risk  Simulates Regression Reviewer requiring rework
  consensus-security-state-risk Simulates Security-State Reviewer rejecting
  consensus-inconclusive     Simulates inconclusive consensus results
  consensus-self-finalizes-rejected Simulates consensus attempting to self-finalize
  consensus-dispatcher-runtime Simulates dispatcher appending events for consensus
  consensus-dispatch-invalid-envelope Simulates rejection of invalid envelope properties
  consensus-dispatch-antigravity-inherits-model Simulates consensus inheriting model without switching
  consensus-live-invocation          Simulates real consensus multi-persona invocation loop
Options:
  --scenario <scenario>      Select the simulation scenario (default: happy-path)
  --json                     Output details in machine-readable JSON format
  --write-checkpoint         Actually write a dry-run checkpoint to .lazycodex/checkpoints/
  --persist-checkpoint       Alias for --write-checkpoint`;
        if (json) {
            printJson({
                ok: true,
                dryRun: true,
                usage: true,
                scenarios: [
                    "happy-path",
                    "quota-opus-exhausted",
                    "context-window-exceeded",
                    "output-token-limit",
                    "provider-unavailable",
                    "subagent-self-finalizes",
                    "stale-heartbeat-missed",
                    "polling-loop-prevented",
                    "parent-progress-reconstruct",
                    "subagent-wrong-role-envelope",
                    "same-error-loop",
                    "oscillating-patch",
                    "heartbeat-only-stall",
                    "no-evidence-progress",
                    "quality-happy-path",
                    "quality-mechanical-fail",
                    "quality-semantic-insufficient-evidence",
                    "quality-consensus-required",
                    "quality-stagnation-unresolved",
                    "hitl-scenario",
                    "rewind-preview",
                    "rewind-create-branch",
                    "rewind-destructive-requires-flag",
                    "rewind-invalid-event-id",
                    "rewind-preserves-original-ledger",
                    "consensus-happy-path",
                    "consensus-devil-rejects",
                    "consensus-regression-risk",
                    "consensus-security-state-risk",
                    "consensus-inconclusive",
                    "consensus-self-finalizes-rejected",
                    "consensus-dispatcher-runtime",
                    "consensus-dispatch-invalid-envelope",
                    "consensus-dispatch-antigravity-inherits-model",
                    "consensus-live-invocation",
                ],
                options: ["--scenario", "--json", "--write-checkpoint", "--persist-checkpoint"],
            });
        }
        else {
            process.stdout.write(`${usage}\n`);
        }
        return 0;
    }
    const writeCheckpoint = argv.includes("--write-checkpoint") || argv.includes("--persist-checkpoint");
    let isQualityScenario = false;
    let qualityStatus = "";
    let qualityStage = "";
    const writeLedger = argv.includes("--write-ledger");
    // Find scenario argument or default to happy-path
    let scenario = "happy-path";
    const scenarioIdx = argv.indexOf("--scenario");
    if (scenarioIdx !== -1) {
        const val = argv[scenarioIdx + 1];
        if (val) {
            scenario = val;
        }
    }
    const platform = "Antigravity";
    const selectedModel = "Gemini 3.7 Flash (High)";
    const userResumeCommand = "/ulw resume";
    const internalResumeCommand = "omo ulw-loop resume";
    const wouldSwitchModel = false;
    const allRoles = ["planner", "researcher", "worker", "verifier", "finalizer"];
    let completedRoles = [];
    let failedRole = null;
    let errorType = null;
    let checkpointPath = null;
    let nextRecommendedAction = "";
    // Simulate based on scenario
    if (scenario === "happy-path") {
        completedRoles = [...allRoles];
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
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
    else if (scenario === "quota-opus-exhausted") {
        completedRoles = ["planner", "researcher"];
        failedRole = "worker";
        errorType = "model_rate_limited";
        nextRecommendedAction = "Switch to Gemini 3.7 Flash (High) in Antigravity UI and run /ulw resume";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
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
        // Save a mock checkpoint
        if (writeCheckpoint) {
            checkpointPath = await saveRoleCheckpoint(repoRoot, {
                taskId: "dry-run-task-quota",
                platform: "Antigravity",
                selectedModel,
                completedRoles,
                currentRole: failedRole,
                failedRole,
                errorType,
                filesChanged: [],
                commandsRun: [],
                artifactsGenerated: [],
                nextRecommendedAction,
                userResumeCommand,
                internalResumeCommand,
                dryRun: true,
            });
            if (!json) {
                process.stdout.write(`[Dry-Run] Saved checkpoint: ${checkpointPath}\n`);
            }
        }
    }
    else if (scenario === "context-window-exceeded") {
        completedRoles = ["planner"];
        failedRole = "researcher";
        errorType = "context_window_exceeded";
        nextRecommendedAction = "Switch to Gemini 3.7 Flash (High) and run /ulw resume in Compact Mode";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
            process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
            process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - FAILED\n`);
            process.stdout.write(`[Dry-Run] Error: context_window_exceeded\n`);
            process.stdout.write(`[Dry-Run] Transitioning to Compact Mode: Summarizing logs, using relevant slices of files, and referencing large outputs via paths.\n`);
        }
        if (writeCheckpoint) {
            checkpointPath = await saveRoleCheckpoint(repoRoot, {
                taskId: "dry-run-task-context",
                platform: "Antigravity",
                selectedModel,
                completedRoles,
                currentRole: failedRole,
                failedRole,
                errorType,
                filesChanged: [],
                commandsRun: [],
                artifactsGenerated: [],
                nextRecommendedAction,
                userResumeCommand,
                internalResumeCommand,
                dryRun: true,
            });
            if (!json) {
                process.stdout.write(`[Dry-Run] Saved checkpoint: ${checkpointPath}\n`);
            }
        }
    }
    else if (scenario === "output-token-limit") {
        completedRoles = ["planner", "researcher"];
        failedRole = "worker";
        errorType = "output_token_limit";
        nextRecommendedAction = "Enable Batch Mode, split edits into smaller patch batches, and run /ulw resume";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
            process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
            process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - SUCCESS\n`);
            process.stdout.write(`[Dry-Run] Running role: worker (would invoke: self / Hephaestus Worker) - FAILED\n`);
            process.stdout.write(`[Dry-Run] Error: output_token_limit\n`);
            process.stdout.write(`[Dry-Run] Transitioning to Batch Mode: Dividing changes into multiple smaller patch batches and validating incrementally.\n`);
        }
        if (writeCheckpoint) {
            checkpointPath = await saveRoleCheckpoint(repoRoot, {
                taskId: "dry-run-task-output",
                platform: "Antigravity",
                selectedModel,
                completedRoles,
                currentRole: failedRole,
                failedRole,
                errorType,
                filesChanged: [],
                commandsRun: [],
                artifactsGenerated: [],
                nextRecommendedAction,
                userResumeCommand,
                internalResumeCommand,
                dryRun: true,
            });
            if (!json) {
                process.stdout.write(`[Dry-Run] Saved checkpoint: ${checkpointPath}\n`);
            }
        }
    }
    else if (scenario === "provider-unavailable") {
        completedRoles = ["planner"];
        failedRole = "researcher";
        errorType = "provider_unavailable";
        nextRecommendedAction = "Wait for provider endpoint recovery or check network status, then run /ulw resume";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing ulw-loop workflow (scenario: ${scenario})...\n`);
            process.stdout.write(`[Dry-Run] Running role: planner (would invoke: self / Prometheus Planner) - SUCCESS\n`);
            process.stdout.write(`[Dry-Run] Running role: researcher (would invoke: research / Codebase Researcher) - FAILED\n`);
            process.stdout.write(`[Dry-Run] Error: provider_unavailable (API Endpoint Down)\n`);
            process.stdout.write(`[Dry-Run] Preventing infinite retry loops: Halting execution. Recommended fallback or wait before re-trying.\n`);
        }
        if (writeCheckpoint) {
            checkpointPath = await saveRoleCheckpoint(repoRoot, {
                taskId: "dry-run-task-provider",
                platform: "Antigravity",
                selectedModel,
                completedRoles,
                currentRole: failedRole,
                failedRole,
                errorType,
                filesChanged: [],
                commandsRun: [],
                artifactsGenerated: [],
                nextRecommendedAction,
                userResumeCommand,
                internalResumeCommand,
                dryRun: true,
            });
            if (!json) {
                process.stdout.write(`[Dry-Run] Saved checkpoint: ${checkpointPath}\n`);
            }
        }
    }
    else if (scenario === "subagent-self-finalizes") {
        const runId = `dry-run-self-finalizes-${Date.now()}`;
        const runDir = getRunDir(repoRoot, runId);
        try {
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing subagent-self-finalizes scenario...\n`);
            }
            await appendRunEvent(repoRoot, runId, "run.created", {});
            await appendRunEvent(repoRoot, runId, "run.state_changed", { state: "working" });
            await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId: "worker-1", role: "worker" });
            await appendRunEvent(repoRoot, runId, "agent.claimed", { agentId: "worker-1" });
            const badResult = {
                runId,
                agentId: "worker-1",
                role: "worker",
                status: "success",
                summary: "I completed the whole task successfully",
                filesChanged: ["src/index.ts"],
                commandsRun: [],
                artifactsGenerated: [],
                blockers: [],
                nextRecommendedAction: "None",
                requiresParentAck: true,
            };
            if (!json) {
                process.stdout.write(`[Dry-Run] Subagent worker-1 reports completion with self-finalizing phrase.\n`);
            }
            try {
                validateResultEnvelope(badResult, runId, "worker");
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (!json) {
                    process.stdout.write(`[Dry-Run] Parent rejected result envelope: ${msg}\n`);
                }
                await appendRunEvent(repoRoot, runId, "parent.rejected", { agentId: "worker-1", reason: msg });
            }
            const state = await reconstructStateFromEvents(repoRoot, runId);
            if (!json) {
                process.stdout.write(`[Dry-Run] Reconstructed agent state: ${state.agents["worker-1"]?.state}\n`);
            }
        }
        finally {
            if (!writeCheckpoint && !writeLedger && existsSync(runDir)) {
                rmSync(runDir, { recursive: true, force: true });
            }
        }
    }
    else if (scenario === "stale-heartbeat-missed") {
        const runId = `dry-run-stale-${Date.now()}`;
        const runDir = getRunDir(repoRoot, runId);
        try {
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing stale-heartbeat-missed scenario...\n`);
            }
            await appendRunEvent(repoRoot, runId, "run.created", {});
            await appendRunEvent(repoRoot, runId, "run.state_changed", { state: "working" });
            await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId: "worker-stale", role: "worker" });
            await appendRunEvent(repoRoot, runId, "agent.claimed", { agentId: "worker-stale" });
            const futureTime = new Date(Date.now() + 150000); // 150 seconds later (> 120s max lease)
            const state = await checkLeases(repoRoot, runId, futureTime);
            if (!json) {
                process.stdout.write(`[Dry-Run] Checking leases at future time: ${futureTime.toISOString()}\n`);
                process.stdout.write(`[Dry-Run] Agent worker-stale assignment state: ${state.agents["worker-stale"]?.state}\n`);
            }
        }
        finally {
            if (!writeCheckpoint && !writeLedger && existsSync(runDir)) {
                rmSync(runDir, { recursive: true, force: true });
            }
        }
    }
    else if (scenario === "polling-loop-prevented") {
        const runId = `dry-run-polling-${Date.now()}`;
        const runDir = getRunDir(repoRoot, runId);
        try {
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing polling-loop-prevented scenario...\n`);
            }
            await appendRunEvent(repoRoot, runId, "run.created", {});
            await registerPoller(repoRoot, runId, "poller-1");
            if (!json) {
                process.stdout.write(`[Dry-Run] Registered poller-1 successfully.\n`);
            }
            try {
                await registerPoller(repoRoot, runId, "poller-2");
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (!json) {
                    process.stdout.write(`[Dry-Run] Registering poller-2 failed: ${msg}\n`);
                }
            }
        }
        finally {
            if (!writeCheckpoint && !writeLedger && existsSync(runDir)) {
                rmSync(runDir, { recursive: true, force: true });
            }
        }
    }
    else if (scenario === "parent-progress-reconstruct") {
        const runId = `dry-run-reconstruct-${Date.now()}`;
        const runDir = getRunDir(repoRoot, runId);
        try {
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing parent-progress-reconstruct scenario...\n`);
            }
            await appendRunEvent(repoRoot, runId, "run.created", {});
            await appendRunEvent(repoRoot, runId, "run.state_changed", { state: "researching" });
            await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId: "researcher-1", role: "researcher" });
            await appendRunEvent(repoRoot, runId, "agent.claimed", { agentId: "researcher-1" });
            await appendRunEvent(repoRoot, runId, "agent.progress", {
                agentId: "researcher-1",
                progress: "Searching files...",
            });
            const state = await reconstructStateFromEvents(repoRoot, runId);
            if (!json) {
                process.stdout.write(`[Dry-Run] Reconstructed global run state: ${state.state}\n`);
                process.stdout.write(`[Dry-Run] Researcher state: ${state.agents["researcher-1"]?.state}\n`);
                process.stdout.write(`[Dry-Run] Researcher progress: ${state.agents["researcher-1"]?.lastProgress}\n`);
            }
        }
        finally {
            if (!writeCheckpoint && !writeLedger && existsSync(runDir)) {
                rmSync(runDir, { recursive: true, force: true });
            }
        }
    }
    else if (scenario === "subagent-wrong-role-envelope") {
        const runId = `dry-run-wrong-role-${Date.now()}`;
        const runDir = getRunDir(repoRoot, runId);
        try {
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing subagent-wrong-role-envelope scenario...\n`);
            }
            await appendRunEvent(repoRoot, runId, "run.created", {});
            await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId: "worker-1", role: "worker" });
            const wrongEnvelope = {
                runId,
                agentId: "worker-1",
                role: "researcher", // Wrong role! Expected worker
                status: "success",
                summary: "I completed the worker task",
                filesChanged: [],
                commandsRun: [],
                artifactsGenerated: [],
                blockers: [],
                nextRecommendedAction: "None",
                requiresParentAck: true,
            };
            try {
                validateResultEnvelope(wrongEnvelope, runId, "worker");
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (!json) {
                    process.stdout.write(`[Dry-Run] Rejects wrong role envelope: ${msg}\n`);
                }
            }
        }
        finally {
            if (!writeCheckpoint && !writeLedger && existsSync(runDir)) {
                rmSync(runDir, { recursive: true, force: true });
            }
        }
    }
    else if (scenario === "same-error-loop") {
        completedRoles = ["planner"];
        failedRole = null;
        nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing same-error-loop scenario...\n`);
            process.stdout.write(`[Dry-Run] Subagent worker repeatedly failing with identical errors.\n`);
            process.stdout.write(`[Dry-Run] StagnationGuard triggered: same_error_loop\n`);
            process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
        }
    }
    else if (scenario === "oscillating-patch") {
        completedRoles = ["planner"];
        failedRole = null;
        nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing oscillating-patch scenario...\n`);
            process.stdout.write(`[Dry-Run] Subagent generating A/B/A/B alternating patches.\n`);
            process.stdout.write(`[Dry-Run] StagnationGuard triggered: oscillation_detected\n`);
            process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
        }
    }
    else if (scenario === "heartbeat-only-stall") {
        completedRoles = ["planner"];
        failedRole = null;
        nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing heartbeat-only-stall scenario...\n`);
            process.stdout.write(`[Dry-Run] Subagent sending heartbeats but no progress.\n`);
            process.stdout.write(`[Dry-Run] StagnationGuard triggered: heartbeat_only_stall\n`);
            process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
        }
    }
    else if (scenario === "no-evidence-progress") {
        completedRoles = ["planner"];
        failedRole = null;
        nextRecommendedAction = "Parent handles stagnation: pause, replan, or human intervention";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing no-evidence-progress scenario...\n`);
            process.stdout.write(`[Dry-Run] Subagent reporting progress without actionable evidence.\n`);
            process.stdout.write(`[Dry-Run] StagnationGuard triggered: no_evidence_progress\n`);
            process.stdout.write(`[Dry-Run] Emitting parent.stagnation_detected event. Run not marked failed directly.\n`);
        }
    }
    else if (scenario === "quality-happy-path") {
        isQualityScenario = true;
        qualityStatus = "passed";
        qualityStage = "all";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing quality-happy-path scenario...\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Mechanical PASSED\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Semantic PASSED\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Consensus SKIPPED\n`);
        }
    }
    else if (scenario === "quality-mechanical-fail") {
        isQualityScenario = true;
        qualityStatus = "failed";
        qualityStage = "mechanical";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing quality-mechanical-fail scenario...\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Mechanical FAILED (No commands run to verify changes)\n`);
        }
    }
    else if (scenario === "quality-semantic-insufficient-evidence") {
        isQualityScenario = true;
        qualityStatus = "failed";
        qualityStage = "semantic";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing quality-semantic-insufficient-evidence scenario...\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Mechanical PASSED\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Semantic FAILED (Goal or evidence mismatch)\n`);
        }
    }
    else if (scenario === "quality-consensus-required") {
        isQualityScenario = true;
        qualityStatus = "required";
        qualityStage = "consensus";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing quality-consensus-required scenario...\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Mechanical PASSED\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Semantic PASSED\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Consensus REQUIRED (riskLevel=high)\n`);
        }
    }
    else if (scenario === "quality-stagnation-unresolved") {
        isQualityScenario = true;
        qualityStatus = "failed";
        qualityStage = "semantic";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing quality-stagnation-unresolved scenario...\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Mechanical PASSED\n`);
            process.stdout.write(`[Dry-Run] Quality Gate: Semantic FAILED (Unresolved stagnation detected)\n`);
        }
    }
    else if (scenario === "hitl-scenario") {
        completedRoles = ["planner"];
        failedRole = null;
        nextRecommendedAction = "User provides missing input or approves action, then run /ulw resume";
        if (!json) {
            process.stdout.write(`[Dry-Run] Initializing hitl-scenario...\n`);
            process.stdout.write(`[Dry-Run] Hook execution returned HITL_REQUIRED.\n`);
            process.stdout.write(`[Dry-Run] Emitted parent.hitl_required event. RunState paused.\n`);
            process.stdout.write(`[Dry-Run] Waiting for parent.resumed to resolve HITL state.\n`);
        }
    }
    else if (scenario.startsWith("rewind-")) {
        const runId = `dry-run-rewind-${Date.now()}`;
        const runDir = getRunDir(repoRoot, runId);
        try {
            if (!json)
                process.stdout.write(`[Dry-Run] Initializing ${scenario}...\n`);
            await appendRunEvent(repoRoot, runId, "run.created", {});
            const e2 = await appendRunEvent(repoRoot, runId, "run.state_changed", { state: "working" });
            await appendRunEvent(repoRoot, runId, "run.state_changed", { state: "failed" });
            const { rewindLedger } = await import("./control-plane.js");
            if (scenario === "rewind-invalid-event-id") {
                try {
                    await rewindLedger(repoRoot, runId, "invalid-event-id", { destructive: true });
                }
                catch (err) {
                    if (!json)
                        process.stdout.write(`[Dry-Run] Caught expected error: ${err}\n`);
                }
            }
            else if (scenario === "rewind-destructive-requires-flag") {
                if (!json)
                    process.stdout.write(`[Dry-Run] Default rewind avoids destructive truncate without flag.\n`);
            }
            else {
                // Base execution for preview, branch, preserves
                await rewindLedger(repoRoot, runId, e2.eventId ?? "", { destructive: scenario.includes("destructive") });
            }
            if (json) {
                const isDestructive = scenario.includes("destructive") && scenario !== "rewind-destructive-requires-flag";
                printJson({
                    ok: true,
                    dryRun: true,
                    scenario,
                    wouldTruncateLedger: isDestructive,
                    wouldCreateBranch: !isDestructive,
                    wouldPreserveOriginalLedger: !isDestructive,
                    wouldCreateBackup: isDestructive,
                    requiresExplicitDestructiveFlag: scenario === "rewind-destructive-requires-flag",
                    wouldCallModelApi: false,
                    wouldModifySourceFiles: false,
                    wouldSwitchModel: false,
                    wouldCompleteRun: false,
                    wouldFailRun: false,
                    wouldKillSubagent: false,
                });
                return 0; // JSON handled
            }
            else {
                process.stdout.write(`[Dry-Run] Scenario ${scenario} complete.\n`);
            }
        }
        finally {
            if (!writeCheckpoint && !writeLedger && existsSync(runDir)) {
                rmSync(runDir, { recursive: true, force: true });
            }
        }
    }
    else if (scenario.startsWith("consensus-")) {
        isQualityScenario = true;
        qualityStage = "consensus";
        if (scenario === "consensus-happy-path") {
            qualityStatus = "passed";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-happy-path...\n`);
                process.stdout.write(`[Dry-Run] All personas (advocate, devils_advocate, regression_reviewer, security_state_reviewer) approved.\n`);
                process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_passed (finalizerAllowed=true)\n`);
            }
        }
        else if (scenario === "consensus-devil-rejects") {
            qualityStatus = "failed";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-devil-rejects...\n`);
                process.stdout.write(`[Dry-Run] Persona devils_advocate rejected.\n`);
                process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_failed (finalizerAllowed=false)\n`);
            }
        }
        else if (scenario === "consensus-regression-risk") {
            qualityStatus = "rework_required";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-regression-risk...\n`);
                process.stdout.write(`[Dry-Run] Persona regression_reviewer requested needs_rework.\n`);
                process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_rework_required (finalizerAllowed=false)\n`);
            }
        }
        else if (scenario === "consensus-security-state-risk") {
            qualityStatus = "failed";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-security-state-risk...\n`);
                process.stdout.write(`[Dry-Run] Persona security_state_reviewer rejected.\n`);
                process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_failed (finalizerAllowed=false)\n`);
            }
        }
        else if (scenario === "consensus-inconclusive") {
            qualityStatus = "inconclusive";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-inconclusive...\n`);
                process.stdout.write(`[Dry-Run] Consensus results are inconclusive.\n`);
                process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_inconclusive (parentActionRequired=true)\n`);
            }
        }
        else if (scenario === "consensus-self-finalizes-rejected") {
            qualityStatus = "failed";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-self-finalizes-rejected...\n`);
                process.stdout.write(`[Dry-Run] Consensus subagent envelope validation failed: consensus subagents cannot finalize run or directly assert run.completed/failed.\n`);
                process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_failed (finalizerAllowed=false)\n`);
            }
        }
        else if (scenario === "consensus-dispatcher-runtime") {
            qualityStatus = "passed";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-dispatcher-runtime...\n`);
                await import("./cli-control-plane.js");
                process.stdout.write(`[Dry-Run] Invoking dispatchConsensusCmd...\n`);
                process.stdout.write(`[Dry-Run] Invoking reportConsensusResultCmd for 4 personas...\n`);
                process.stdout.write(`[Dry-Run] Invoking aggregateConsensusCmd...\n`);
                process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_passed (finalizerAllowed=true)\n`);
            }
        }
        else if (scenario === "consensus-dispatch-invalid-envelope") {
            qualityStatus = "failed";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-dispatch-invalid-envelope...\n`);
                process.stdout.write(`[Dry-Run] Subagent attempts to submit envelope with mayFinalizeRun=true.\n`);
                process.stdout.write(`[Dry-Run] Envelope rejected by validateConsensusResultEnvelope.\n`);
                process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_failed (finalizerAllowed=false)\n`);
            }
        }
        else if (scenario === "consensus-dispatch-antigravity-inherits-model") {
            qualityStatus = "passed";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-dispatch-antigravity-inherits-model...\n`);
                process.stdout.write(`[Dry-Run] Dispatcher creates role envelopes with wouldSwitchModel: false.\n`);
                process.stdout.write(`[Dry-Run] Antigravity policy satisfied.\n`);
            }
        }
        else if (scenario === "consensus-live-invocation") {
            isQualityScenario = true;
            qualityStage = "consensus";
            qualityStatus = "passed";
            if (!json) {
                process.stdout.write(`[Dry-Run] Initializing consensus-live-invocation...\n`);
            }
            const runId = `dry-run-live-${Date.now()}`;
            const runDir = getRunDir(repoRoot, runId);
            try {
                const { dispatchConsensus, setMockPersonaVerdict, reportConsensusResult, aggregateConsensus } = await import("./consensus-dispatcher.js");
                const { appendRunEvent, readRunEvents } = await import("./control-plane.js");
                // 1. Approve Case
                if (!json)
                    process.stdout.write(`[Dry-Run] Case 1: All personas approve...\n`);
                await appendRunEvent(repoRoot, runId, "run.created", {});
                setMockPersonaVerdict("advocate", "approve");
                setMockPersonaVerdict("devils_advocate", "approve");
                setMockPersonaVerdict("regression_reviewer", "approve");
                setMockPersonaVerdict("security_state_reviewer", "approve");
                const resApprove = await dispatchConsensus(repoRoot, runId, "test-fp-approve", {
                    mockLive: true,
                    prompt: "Simulated task",
                });
                const events1 = await readRunEvents(repoRoot, runId);
                const passedEvent = events1.find((e) => e.type === "quality_gate.consensus_passed" && e.consensusId === resApprove.consensusId);
                if (!passedEvent?.finalizerAllowed || !passedEvent.isMockLive) {
                    throw new Error("Case 1 (Approve) validation failed in Dry-Run");
                }
                // 2. Reject Case
                if (!json)
                    process.stdout.write(`[Dry-Run] Case 2: Devil's Advocate rejects...\n`);
                setMockPersonaVerdict("advocate", "approve");
                setMockPersonaVerdict("devils_advocate", "reject");
                setMockPersonaVerdict("regression_reviewer", "approve");
                setMockPersonaVerdict("security_state_reviewer", "approve");
                const resReject = await dispatchConsensus(repoRoot, runId, "test-fp-reject", {
                    mockLive: true,
                    prompt: "Simulated task",
                });
                const events2 = await readRunEvents(repoRoot, runId);
                const failedEvent = events2.find((e) => e.type === "quality_gate.consensus_failed" && e.consensusId === resReject.consensusId);
                if (!failedEvent || failedEvent.finalizerAllowed) {
                    throw new Error("Case 2 (Reject) validation failed in Dry-Run");
                }
                // 3. Rework Case
                if (!json)
                    process.stdout.write(`[Dry-Run] Case 3: Regression Reviewer requires rework...\n`);
                setMockPersonaVerdict("advocate", "approve");
                setMockPersonaVerdict("devils_advocate", "approve");
                setMockPersonaVerdict("regression_reviewer", "needs_rework");
                setMockPersonaVerdict("security_state_reviewer", "approve");
                const resRework = await dispatchConsensus(repoRoot, runId, "test-fp-rework", {
                    mockLive: true,
                    prompt: "Simulated task",
                });
                const events3 = await readRunEvents(repoRoot, runId);
                const reworkEvent = events3.find((e) => e.type === "quality_gate.consensus_rework_required" && e.consensusId === resRework.consensusId);
                if (!reworkEvent || reworkEvent.finalizerAllowed) {
                    throw new Error("Case 3 (Rework) validation failed in Dry-Run");
                }
                // 4. Timeout Case
                if (!json)
                    process.stdout.write(`[Dry-Run] Case 4: Persona times out...\n`);
                setMockPersonaVerdict("advocate", "approve");
                setMockPersonaVerdict("devils_advocate", "approve");
                setMockPersonaVerdict("regression_reviewer", "approve");
                setMockPersonaVerdict("security_state_reviewer", "inconclusive");
                const resTimeout = await dispatchConsensus(repoRoot, runId, "test-fp-timeout", {
                    mockLive: true,
                    prompt: "Simulated task",
                });
                const events4 = await readRunEvents(repoRoot, runId);
                const incEvent = events4.find((e) => e.type === "quality_gate.consensus_inconclusive" && e.consensusId === resTimeout.consensusId);
                if (!incEvent || incEvent.finalizerAllowed || !incEvent.parentActionRequired) {
                    throw new Error("Case 4 (Timeout) validation failed in Dry-Run");
                }
                // 5. Invalid Envelope Case
                if (!json)
                    process.stdout.write(`[Dry-Run] Case 5: Invalid Envelope submitted...\n`);
                setMockPersonaVerdict("advocate", "approve");
                setMockPersonaVerdict("devils_advocate", "approve");
                setMockPersonaVerdict("regression_reviewer", "approve");
                setMockPersonaVerdict("security_state_reviewer", "invalid_envelope");
                const resInvalid = await dispatchConsensus(repoRoot, runId, "test-fp-invalid", {
                    mockLive: true,
                    prompt: "Simulated task",
                });
                const events5 = await readRunEvents(repoRoot, runId);
                const invalidIncEvent = events5.find((e) => e.type === "quality_gate.consensus_inconclusive" && e.consensusId === resInvalid.consensusId);
                if (!invalidIncEvent || invalidIncEvent.finalizerAllowed) {
                    throw new Error("Case 5 (Invalid Envelope) validation failed in Dry-Run");
                }
                // 6. Duplicate Same Payload Case
                if (!json)
                    process.stdout.write(`[Dry-Run] Case 6: Duplicate Same Payload reported...\n`);
                setMockPersonaVerdict("advocate", "approve");
                setMockPersonaVerdict("devils_advocate", "approve");
                setMockPersonaVerdict("regression_reviewer", "approve");
                setMockPersonaVerdict("security_state_reviewer", "approve");
                const resDup = await dispatchConsensus(repoRoot, runId, "test-fp-dup", {
                    mockLive: true,
                    prompt: "Simulated task",
                });
                const eventsDup = await readRunEvents(repoRoot, runId);
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
                await reportConsensusResult(repoRoot, runId, resDup.consensusId, dupAgentId, dupEnvelope, true);
                // 7. Duplicate Conflict Case
                if (!json)
                    process.stdout.write(`[Dry-Run] Case 7: Duplicate Conflicting Payload reported...\n`);
                const resConflict = await dispatchConsensus(repoRoot, runId, "test-fp-conflict", { mockLive: false });
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
                await reportConsensusResult(repoRoot, runId, resConflict.consensusId, conflictAgentId, envelope1, true);
                const conflictEnvelope = {
                    ...envelope1,
                    verdict: "reject",
                };
                let conflictThrown = false;
                try {
                    await reportConsensusResult(repoRoot, runId, resConflict.consensusId, conflictAgentId, conflictEnvelope, true);
                }
                catch (err) {
                    if (err.message.includes("Conflict")) {
                        conflictThrown = true;
                    }
                }
                if (!conflictThrown) {
                    throw new Error("Case 7 (Conflict) validation failed in Dry-Run: No conflict error thrown");
                }
                await aggregateConsensus(repoRoot, runId, resConflict.consensusId);
                const events7 = await readRunEvents(repoRoot, runId);
                const conflictPassed = events7.find((e) => e.type === "quality_gate.consensus_passed" && e.consensusId === resConflict.consensusId);
                const conflictFailed = events7.find((e) => e.type === "quality_gate.consensus_failed" && e.consensusId === resConflict.consensusId);
                if (conflictPassed) {
                    throw new Error("Case 7 validation failed in Dry-Run: aggregateConsensus passed despite conflict");
                }
                if (!conflictFailed || conflictFailed.finalizerAllowed) {
                    throw new Error("Case 7 validation failed in Dry-Run: aggregateConsensus did not block finalizer on conflict");
                }
                if (!json) {
                    process.stdout.write(`[Dry-Run] Live invocation mock run simulated successfully.\n`);
                    process.stdout.write(`[Dry-Run] Verdict: quality_gate.consensus_passed (finalizerAllowed=true)\n`);
                }
            }
            finally {
                const { existsSync, rmSync } = await import("node:fs");
                if (existsSync(runDir)) {
                    rmSync(runDir, { recursive: true, force: true });
                }
            }
        }
    }
    else {
        process.stderr.write(`[Dry-Run] Unknown scenario: ${scenario}\n`);
        return 1;
    }
    let isStagnationScenario = false;
    if (scenario === "same-error-loop" ||
        scenario === "oscillating-patch" ||
        scenario === "heartbeat-only-stall" ||
        scenario === "no-evidence-progress") {
        isStagnationScenario = true;
    }
    if (json) {
        const finalizerAllowed = isQualityScenario ? qualityStatus === "passed" : false;
        printJson({
            ok: true,
            dryRun: true,
            finalizerAllowed,
            platform,
            scenario,
            selectedModel,
            roles: allRoles,
            completedRoles,
            failedRole,
            errorType,
            checkpointPath,
            nextRecommendedAction,
            userResumeCommand,
            internalResumeCommand,
            wouldCallModelApi: false,
            wouldModifySourceFiles: false,
            wouldSwitchModel: false,
            wouldFailRun: false,
            wouldCompleteRun: false,
            wouldKillSubagent: false,
            parentActionRequired: isQualityScenario ? qualityStatus !== "passed" : true,
            ...(isStagnationScenario && {
                stagnationTriggered: true,
                stagnationReason: scenario,
                eventType: "parent.stagnation_detected",
            }),
            ...(isQualityScenario && {
                qualityGateTriggered: true,
                qualityStage,
                qualityStatus,
                eventType: qualityStatus === "passed"
                    ? qualityStage === "consensus"
                        ? "quality_gate.consensus_passed"
                        : "quality_gate.completed"
                    : qualityStatus === "required"
                        ? "quality_gate.consensus_required"
                        : qualityStage === "consensus" && qualityStatus === "rework_required"
                            ? "quality_gate.consensus_rework_required"
                            : qualityStage === "consensus" && qualityStatus === "inconclusive"
                                ? "quality_gate.consensus_inconclusive"
                                : "quality_gate.failed",
            }),
            ...(scenario === "hitl-scenario" && {
                hitlTriggered: true,
                hitlReason: "Hook execution failed. HITL required.",
                eventType: "parent.hitl_required",
            }),
        });
    }
    else {
        process.stdout.write(`[Dry-Run] Output details:\n`);
        process.stdout.write(`  Platform: ${platform}\n`);
        process.stdout.write(`  Selected Model: ${selectedModel}\n`);
        process.stdout.write(`  Scenario: ${scenario}\n`);
        process.stdout.write(`  Roles: ${allRoles.join(" -> ")}\n`);
        process.stdout.write(`  Completed Roles: ${completedRoles.join(", ")}\n`);
        process.stdout.write(`  Failed Role: ${failedRole || "None"}\n`);
        process.stdout.write(`  Error Type: ${errorType || "None"}\n`);
        process.stdout.write(`  Checkpoint Path: ${checkpointPath || "None"}\n`);
        process.stdout.write(`  Next Recommended Action: ${nextRecommendedAction || "None"}\n`);
        process.stdout.write(`  User Resume Command: ${userResumeCommand}\n`);
        process.stdout.write(`  Model Auto-Switch: Disabled (wouldSwitchModel: ${wouldSwitchModel})\n`);
        if (isStagnationScenario) {
            process.stdout.write(`  Stagnation Detected: true\n`);
            process.stdout.write(`  Event Type: parent.stagnation_detected\n`);
            process.stdout.write(`  Would Fail Run: false\n`);
            process.stdout.write(`  Would Kill Subagent: false\n`);
            process.stdout.write(`  Parent Action Required: true\n`);
        }
        if (isQualityScenario) {
            process.stdout.write(`  Quality Gate Triggered: true\n`);
            process.stdout.write(`  Quality Stage: ${qualityStage}\n`);
            process.stdout.write(`  Quality Status: ${qualityStatus}\n`);
            process.stdout.write(`  Would Fail Run: false\n`);
            process.stdout.write(`  Would Kill Subagent: false\n`);
        }
        if (scenario === "hitl-scenario") {
            process.stdout.write(`  HITL Triggered: true\n`);
            process.stdout.write(`  Event Type: parent.hitl_required\n`);
            process.stdout.write(`  Parent Action Required: true\n`);
        }
    }
    return 0;
}
