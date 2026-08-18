import { readValue } from "./cli-arg-parser.js";
import { printJson } from "./cli-output.js";
import { appendRunEvent, checkLeases, heartbeatAgent, reconstructStateFromEvents, registerPoller, rewindLedger, validateResultEnvelope, } from "./control-plane.js";
import { UlwLoopError } from "./types.js";
export { aggregateConsensusCmd, dispatchConsensusCmd, reportConsensusResultCmd } from "./cli-consensus-commands.js";
function required(argv, flag) {
    const value = readValue(argv, flag)?.trim();
    if (!value) {
        throw new UlwLoopError(`Missing ${flag}.`, "ULW_LOOP_ARGUMENT_MISSING", { details: { flag } });
    }
    if ((flag === "--run-id" || flag === "--agent-id") && !/^[A-Za-z0-9._-]+$/.test(value)) {
        throw new UlwLoopError(`Invalid ${flag}: must match ^[A-Za-z0-9._-]+$`, "ULW_LOOP_ARGUMENT_INVALID", {
            details: { flag, value },
        });
    }
    return value;
}
async function readJsonOrPath(value, repoRoot) {
    try {
        return JSON.parse(value);
    }
    catch {
        const { resolve } = await import("node:path");
        const { existsSync } = await import("node:fs");
        const { readFile } = await import("node:fs/promises");
        const path = resolve(repoRoot, value);
        if (existsSync(path)) {
            return JSON.parse(await readFile(path, "utf8"));
        }
        throw new Error(`Invalid JSON or unreadable file path: ${value}`);
    }
}
export async function initRunCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const event = await appendRunEvent(repoRoot, runId, "run.created", {});
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Run ${runId} initialized.\n`);
    return 0;
}
export async function setRunStateCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const state = required(argv, "--state");
    let eventType = "run.state_changed";
    if (state === "completed")
        eventType = "run.completed";
    else if (state === "failed")
        eventType = "run.failed";
    else if (state === "paused")
        eventType = "parent.paused";
    else if (state === "working")
        eventType = "parent.resumed";
    const event = await appendRunEvent(repoRoot, runId, eventType, { state });
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Run ${runId} state set to ${state}.\n`);
    return 0;
}
export async function dispatchAgentCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const agentId = required(argv, "--agent-id");
    const role = required(argv, "--role");
    const event = await appendRunEvent(repoRoot, runId, "agent.dispatched", { agentId, role });
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Agent ${agentId} (${role}) dispatched.\n`);
    return 0;
}
export async function claimAgentCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const agentId = required(argv, "--agent-id");
    const event = await appendRunEvent(repoRoot, runId, "agent.claimed", { agentId });
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Agent ${agentId} claimed.\n`);
    return 0;
}
export async function heartbeatAgentCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const agentId = required(argv, "--agent-id");
    const event = await heartbeatAgent(repoRoot, runId, agentId);
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Agent ${agentId} heartbeat recorded.\n`);
    return 0;
}
export async function progressAgentCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const agentId = required(argv, "--agent-id");
    const progress = required(argv, "--progress");
    const event = await appendRunEvent(repoRoot, runId, "agent.progress", { agentId, progress });
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Agent ${agentId} progress: ${progress}\n`);
    return 0;
}
export async function reportCompleteCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const agentId = required(argv, "--agent-id");
    const resultJsonStr = required(argv, "--result-json");
    const result = await readJsonOrPath(resultJsonStr, repoRoot);
    const state = await reconstructStateFromEvents(repoRoot, runId);
    const agent = state.agents[agentId];
    if (!agent) {
        throw new Error(`Agent ${agentId} not found in run ${runId}`);
    }
    const envelope = validateResultEnvelope(result, runId, agent.role);
    const event = await appendRunEvent(repoRoot, runId, "agent.completed_reported", { agentId, result: envelope });
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Agent ${agentId} reported completion.\n`);
    return 0;
}
export async function reportFailedCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const agentId = required(argv, "--agent-id");
    const resultJsonStr = required(argv, "--result-json");
    const result = await readJsonOrPath(resultJsonStr, repoRoot);
    const state = await reconstructStateFromEvents(repoRoot, runId);
    const agent = state.agents[agentId];
    if (!agent) {
        throw new Error(`Agent ${agentId} not found in run ${runId}`);
    }
    const envelope = validateResultEnvelope(result, runId, agent.role);
    const event = await appendRunEvent(repoRoot, runId, "agent.failed_reported", { agentId, result: envelope });
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Agent ${agentId} reported failure.\n`);
    return 0;
}
export async function ackAgentCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const agentId = required(argv, "--agent-id");
    const event = await appendRunEvent(repoRoot, runId, "parent.acknowledged", { agentId });
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Agent ${agentId} result acknowledged by parent.\n`);
    return 0;
}
export async function rejectAgentCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const agentId = required(argv, "--agent-id");
    const event = await appendRunEvent(repoRoot, runId, "parent.rejected", { agentId });
    if (json)
        printJson({ ok: true, event });
    else
        process.stdout.write(`Agent ${agentId} result rejected by parent.\n`);
    return 0;
}
export async function checkLeasesCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const state = await checkLeases(repoRoot, runId);
    if (json)
        printJson({ ok: true, state });
    else {
        process.stdout.write(`Checked leases for run ${runId}.\n`);
        process.stdout.write(`  Run State: ${state.state}\n`);
        if (state.hitlReason) {
            process.stdout.write(`  [HITL_REQUIRED: ${state.hitlReason}]\n`);
        }
        for (const agentId of Object.keys(state.agents)) {
            const agent = state.agents[agentId];
            if (agent) {
                process.stdout.write(`  Agent ${agentId}: state=${agent.state}, leaseExpiresAt=${agent.leaseExpiresAt}\n`);
            }
        }
    }
    return 0;
}
export async function registerPollerCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const pollerId = required(argv, "--poller-id");
    const poller = await registerPoller(repoRoot, runId, pollerId);
    if (json)
        printJson({ ok: true, poller });
    else
        process.stdout.write(`Registered poller ${pollerId} for run ${runId}. Expires at ${poller.expiresAt}\n`);
    return 0;
}
export async function rewindRunCmd(repoRoot, argv, json) {
    const runId = required(argv, "--run-id");
    const toEventId = required(argv, "--to-event");
    const isDestructive = argv.includes("--destructive");
    const state = await rewindLedger(repoRoot, runId, toEventId, { destructive: isDestructive });
    if (json)
        printJson({ ok: true, state, destructive: isDestructive });
    else {
        process.stdout.write(`Run ${runId} rewinded to event ${toEventId}.\n`);
        process.stdout.write(`  Destructive Truncate: ${isDestructive}\n`);
        process.stdout.write(`  State is now: ${state.state}\n`);
    }
    return 0;
}
