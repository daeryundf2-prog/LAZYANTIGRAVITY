import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkLeases, heartbeatAgent, registerPoller, validateQualityEvidenceEnvelope, validateResultEnvelope, } from "./control-plane-helpers.js";
import { readRunEvents, reconstructAndSaveState, reconstructStateFromEvents, repairLedgerFile } from "./reconstruct.js";
import { stripSensitiveData } from "./sensitive-data-scrubber.js";
export { checkLeases, heartbeatAgent, readRunEvents, reconstructAndSaveState, reconstructStateFromEvents, registerPoller, repairLedgerFile, stripSensitiveData, validateQualityEvidenceEnvelope, validateResultEnvelope, };
const DEFAULT_POLICY = {
    subagentLease: {
        defaultLeaseMs: 30000,
        maxLeaseMs: 120000,
        heartbeatIntervalMs: 10000,
        staleGraceMs: 5000,
        maxMissedHeartbeats: 3,
    },
    pollingGuard: {
        pollerLeaseMs: 10000,
    },
};
export const FORBIDDEN_PHRASES = [
    /completed the whole task/i,
    /completed the entire task/i,
    /finished the entire \/ulw/i,
    /finished the whole \/ulw/i,
    /run completed/i,
    /task completed/i,
    /ulw task is complete/i,
    /finalize run/i,
    /mark run as completed/i,
    /completed the global task/i,
];
function safeSegment(val) {
    const sanitized = val.replace(/[^A-Za-z0-9._-]/g, "_");
    return sanitized.replace(/^(\.\.(\/|\\|$))+/, "") || "default";
}
export function getRunDir(repoRoot, runId) {
    return join(repoRoot, ".lazycodex", "runs", safeSegment(runId));
}
export async function loadLeasePolicy(repoRoot) {
    const policyPath = join(repoRoot, "plugins", "omo", "components", "ulw-loop", "src", "lease-policy.json");
    if (existsSync(policyPath)) {
        try {
            const content = await readFile(policyPath, "utf8");
            return JSON.parse(content);
        }
        catch {
            return DEFAULT_POLICY;
        }
    }
    return DEFAULT_POLICY;
}
export async function appendRunEvent(repoRoot, runId, type, data) {
    const runDir = getRunDir(repoRoot, runId);
    if (!existsSync(runDir))
        await mkdir(runDir, { recursive: true });
    const existingEvents = await readRunEvents(repoRoot, runId);
    const lastEvent = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1] : undefined;
    const prevHash = lastEvent?.hash || "0000000000000000000000000000000000000000000000000000000000000000";
    const event = {
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        type,
        runId,
        prevHash,
        ...data,
    };
    const cleanEvent = stripSensitiveData(event);
    const hashPayload = JSON.stringify({
        eventId: cleanEvent.eventId,
        timestamp: cleanEvent.timestamp,
        type: cleanEvent.type,
        runId: cleanEvent.runId,
        prevHash: cleanEvent.prevHash,
        payload: cleanEvent,
    });
    cleanEvent.hash = createHash("sha256").update(hashPayload).digest("hex");
    const eventsFile = join(runDir, "events.jsonl");
    await writeFile(eventsFile, `${JSON.stringify(cleanEvent)}\n`, { flag: "a", encoding: "utf8" });
    await reconstructAndSaveState(repoRoot, runId);
    if (event.agentId) {
        const agentsDir = join(runDir, "agents");
        if (!existsSync(agentsDir))
            await mkdir(agentsDir, { recursive: true });
        const agentState = await getAgentState(repoRoot, runId, event.agentId);
        if (agentState) {
            await writeFile(join(agentsDir, `${safeSegment(event.agentId)}.json`), JSON.stringify(stripSensitiveData(agentState), null, 2), "utf8");
        }
    }
    return cleanEvent;
}
export async function getAgentState(repoRoot, runId, agentId) {
    const state = await reconstructStateFromEvents(repoRoot, runId);
    return state.agents[agentId] || null;
}
export async function rewindLedger(repoRoot, runId, toEventId, options) {
    const runDir = getRunDir(repoRoot, runId);
    if (!existsSync(runDir))
        throw new Error(`Run ${runId} not found`);
    const events = await readRunEvents(repoRoot, runId);
    const targetIdx = events.findIndex((e) => e.eventId === toEventId);
    if (targetIdx === -1)
        throw new Error(`Event ID ${toEventId} not found in ledger for run ${runId}`);
    if (options?.destructive === true) {
        const backupsDir = join(runDir, "backups");
        if (!existsSync(backupsDir))
            await mkdir(backupsDir, { recursive: true });
        await writeFile(join(backupsDir, `events-before-rewind-${Date.now()}.jsonl`), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");
        await writeFile(join(runDir, "events.jsonl"), `${events
            .slice(0, targetIdx + 1)
            .map((e) => JSON.stringify(e))
            .join("\n")}\n`, "utf8");
    }
    else {
        const attemptId = `attempt-${Date.now()}`;
        await appendRunEvent(repoRoot, runId, "lineage.rewind_requested", {
            rewindTargetEventId: toEventId,
        });
        await appendRunEvent(repoRoot, runId, "lineage.branch_created", {
            attemptId,
            createdFromEventId: toEventId,
            previousState: events[targetIdx]?.state || "working",
        });
        const lineageFile = join(runDir, "lineage.json");
        const attemptsDir = join(runDir, "attempts");
        if (!existsSync(attemptsDir))
            await mkdir(attemptsDir, { recursive: true });
        let lineageData = { runId, currentAttemptId: attemptId, history: [attemptId] };
        if (existsSync(lineageFile)) {
            try {
                const parsed = JSON.parse(await readFile(lineageFile, "utf8"));
                lineageData = { ...parsed, currentAttemptId: attemptId };
                lineageData.history.push(attemptId);
            }
            catch { }
        }
        await writeFile(lineageFile, JSON.stringify(lineageData, null, 2), "utf8");
        const prevAttempt = lineageData.history.length > 1 ? lineageData.history[lineageData.history.length - 2] : null;
        await writeFile(join(attemptsDir, `${attemptId}.json`), JSON.stringify({
            attemptId,
            parentAttemptId: prevAttempt,
            branchId: `branch-${runId}-${attemptId}`,
            rewindTargetEventId: toEventId,
            supersedesAttemptId: prevAttempt,
            createdFromEventId: toEventId,
            createdAt: new Date().toISOString(),
        }, null, 2), "utf8");
    }
    return await reconstructAndSaveState(repoRoot, runId);
}
