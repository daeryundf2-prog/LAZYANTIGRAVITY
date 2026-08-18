export interface StagnationPolicy {
    recentEventWindow: number;
    repeatedErrorThreshold: number;
    repeatedPatchThreshold: number;
    oscillationWindow: number;
    heartbeatOnlyThreshold: number;
    noEvidenceProgressThreshold: number;
    actionOnStagnation: string;
    minimumEventsForDetection: number;
    cooldownEventsAfterDetection: number;
    requireSameAgentForRepeatedError: boolean;
    requireSameRoleForOscillation: boolean;
    ignoreHeartbeatOnlyWhenRoleIsWaiting: boolean;
    defaultSeverity: string;
}
export declare const DEFAULT_STAGNATION_POLICY: StagnationPolicy;
export type StagnationStatus = "ok" | "stagnation_candidate" | "same_error_loop" | "oscillation_detected" | "heartbeat_only_stall" | "no_evidence_progress";
export interface StagnationDetectedPayload {
    runId: string;
    agentId?: string;
    role?: string;
    kind: string;
    severity: string;
    fingerprint: string;
    matchedEventIds: string[];
    windowSize: number;
    threshold: number;
    suggestedParentAction: string;
    parentActionRequired: boolean;
    mustNotAutoFailRun: boolean;
    wouldSwitchModel: boolean;
    timestamp: string;
}
export interface StagnationResult {
    status: StagnationStatus;
    details?: string;
    payload?: StagnationDetectedPayload;
}
export declare function loadStagnationPolicy(repoRoot: string): Promise<StagnationPolicy>;
