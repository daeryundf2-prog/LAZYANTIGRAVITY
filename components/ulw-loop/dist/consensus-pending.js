import { ALL_PERSONAS } from "./consensus-types.js";
import { getPersonaSystemPrompt } from "./consensus-dispatcher.js";
import { readRunEvents } from "./control-plane.js";
import { UlwLoopError } from "./types.js";
/**
 * Host-subagent consensus transport: lists the personas dispatched for a
 * consensus round that have not reported a verdict yet, together with the
 * exact review prompt the parent agent should pass to `invoke_subagent`.
 * Verdicts come back through `report-consensus-result` and are aggregated
 * by `aggregate-consensus`.
 */
export async function getConsensusPending(repoRoot, runId, consensusId) {
    const events = await readRunEvents(repoRoot, runId);
    const started = [...events]
        .reverse()
        .find((e) => e.type === "quality_gate.consensus_started" && (!consensusId || e.consensusId === consensusId));
    if (!started || typeof started.consensusId !== "string") {
        throw new UlwLoopError(`No consensus dispatch found for run ${runId}.`, "ULW_LOOP_CONSENSUS_NOT_DISPATCHED");
    }
    const cid = started.consensusId;
    const reported = new Set(events
        .filter((e) => e.type === "quality_gate.consensus_persona_reported" && e.consensusId === cid)
        .map((e) => e.persona));
    const targetPrompt = typeof started.prompt === "string" && started.prompt.trim().length > 0
        ? started.prompt
        : "Verify the workspace changes.";
    const pending = ALL_PERSONAS.filter((persona) => !reported.has(persona)).map((persona) => {
        const agentId = `${persona}-${cid.substring(0, 8)}`;
        return {
            persona,
            agentId,
            fullPrompt: `${getPersonaSystemPrompt(persona, runId, cid, agentId)}\n\n[합의 대상 프롬프트]\n${targetPrompt}`,
        };
    });
    return { consensusId: cid, prompt: targetPrompt, pending, reported: [...reported] };
}
