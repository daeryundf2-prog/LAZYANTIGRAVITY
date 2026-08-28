export interface PendingPersonaReview {
    readonly persona: string;
    readonly agentId: string;
    readonly fullPrompt: string;
}
export interface ConsensusPendingReport {
    readonly consensusId: string;
    readonly prompt: string;
    readonly pending: readonly PendingPersonaReview[];
    readonly reported: readonly string[];
}
/**
 * Host-subagent consensus transport: lists the personas dispatched for a
 * consensus round that have not reported a verdict yet, together with the
 * exact review prompt the parent agent should pass to `invoke_subagent`.
 * Verdicts come back through `report-consensus-result` and are aggregated
 * by `aggregate-consensus`.
 */
export declare function getConsensusPending(repoRoot: string, runId: string, consensusId?: string): Promise<ConsensusPendingReport>;
