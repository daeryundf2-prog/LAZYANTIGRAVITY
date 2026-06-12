import type { LedgerEvent, PollerState, QualityEvidenceEnvelope, RunStateSchema, SubagentResultEnvelope } from "./control-plane-types.js";
export declare function validateQualityEvidenceEnvelope(envelope: unknown): QualityEvidenceEnvelope;
export declare function validateResultEnvelope(envelope: unknown, expectedRunId: string, expectedRole: string): SubagentResultEnvelope;
export declare function registerPoller(repoRoot: string, runId: string, pollerId: string, nowOverride?: Date): Promise<PollerState>;
export declare function heartbeatAgent(repoRoot: string, runId: string, agentId: string): Promise<LedgerEvent>;
export declare function checkLeases(repoRoot: string, runId: string, nowOverride?: Date): Promise<RunStateSchema>;
