import type { ExecutionBinding } from "./evidence-contract.js";
export interface HostExecutionRequest {
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd: string;
    readonly requestId: string;
    readonly runId: string;
    readonly sessionId: string;
    readonly toolCallId?: string;
    readonly timeoutMs?: number;
    readonly maxBuffer?: number;
}
export interface HostExecutionResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly binding: ExecutionBinding;
}
export declare function executeHostCommand(request: HostExecutionRequest): Promise<HostExecutionResult>;
export declare function fingerprintOutput(value: string): string;
