export interface FailureEventInput {
    toolName: string;
    errorMessage: string;
    targetPath?: string;
    eventType?: string;
}
export declare function getFailureEventsPath(cwd?: string): string;
/**
 * Best-effort failure recording for the active-learning feedback loop.
 * Never throws: a telemetry failure must not break the failing caller.
 */
export declare function recordFailureEvent(input: FailureEventInput, cwd?: string): boolean;
