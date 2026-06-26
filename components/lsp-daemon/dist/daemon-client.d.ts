import type { ToolExecutionResult } from "@oh-my-opencode/lsp-core/tools";
import { type DaemonPaths } from "./paths.js";
export declare class DaemonRequestError extends Error {
    readonly requestWritten: boolean;
    constructor(message: string, requestWritten: boolean);
}
export interface DaemonToolContext {
    cwd?: string;
    env?: Record<string, string>;
}
export interface CallToolOptions {
    context?: DaemonToolContext;
    paths?: DaemonPaths;
    requestTimeoutMs?: number;
    ensure?: (paths: DaemonPaths) => Promise<void>;
}
export declare function callToolViaDaemon(name: string, args: Record<string, unknown>, options?: CallToolOptions): Promise<ToolExecutionResult>;
export declare function callDiagnosticsViaDaemon(filePath: string, options?: CallToolOptions): Promise<ToolExecutionResult>;
export declare function currentRequestContext(env?: NodeJS.ProcessEnv): DaemonToolContext;
