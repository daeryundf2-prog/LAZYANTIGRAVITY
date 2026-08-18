import { DaemonConfig } from "./server.js";
import { BlackboardEntry } from "./blackboard.js";
export declare class DaemonClient {
    private config;
    constructor(config?: DaemonConfig);
    isRunning(): boolean;
    send<T = unknown>(command: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T, options?: {
        ttlMs?: number;
        agentId?: string;
        namespace?: string;
    }): Promise<BlackboardEntry<T> | null>;
    list(namespace?: string): Promise<BlackboardEntry[]>;
    status(): Promise<{
        status: string;
        pid?: number;
        uptimeMs?: number;
        entriesCount?: number;
    } | null>;
}
