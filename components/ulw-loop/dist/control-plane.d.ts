import { checkLeases, heartbeatAgent, registerPoller, validateQualityEvidenceEnvelope, validateResultEnvelope } from "./control-plane-helpers.js";
import { readRunEvents, reconstructAndSaveState, reconstructStateFromEvents, repairLedgerFile } from "./reconstruct.js";
import { stripSensitiveData } from "./sensitive-data-scrubber.js";
export { checkLeases, heartbeatAgent, readRunEvents, reconstructAndSaveState, reconstructStateFromEvents, registerPoller, repairLedgerFile, stripSensitiveData, validateQualityEvidenceEnvelope, validateResultEnvelope, };
import type { AgentState, AssignmentState, EventType, LeasePolicy, LedgerEvent, PollerState, RunState, RunStateSchema, SubagentResultEnvelope } from "./control-plane-types.js";
export type { AgentState, AssignmentState, EventType, LeasePolicy, LedgerEvent, PollerState, RunState, RunStateSchema, SubagentResultEnvelope, };
export declare const FORBIDDEN_PHRASES: RegExp[];
export declare function getRunDir(repoRoot: string, runId: string): string;
export declare function loadLeasePolicy(repoRoot: string): Promise<LeasePolicy>;
export declare function appendRunEvent(repoRoot: string, runId: string, type: EventType, data: Omit<LedgerEvent, "timestamp" | "type" | "runId">): Promise<LedgerEvent>;
export declare function getAgentState(repoRoot: string, runId: string, agentId: string): Promise<AgentState | null>;
export declare function rewindLedger(repoRoot: string, runId: string, toEventId: string, options?: {
    destructive?: boolean;
}): Promise<RunStateSchema>;
