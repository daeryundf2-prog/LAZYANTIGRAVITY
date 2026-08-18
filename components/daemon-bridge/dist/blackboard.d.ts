export interface BlackboardEntry<T = unknown> {
    key: string;
    value: T;
    timestamp: number;
    ttlMs?: number;
    agentId?: string;
    namespace?: string;
}
export declare class SharedBlackboard {
    private entries;
    set<T>(key: string, value: T, options?: {
        ttlMs?: number;
        agentId?: string;
        namespace?: string;
    }): BlackboardEntry<T>;
    get<T>(key: string): T | null;
    delete(key: string): boolean;
    list(namespace?: string): BlackboardEntry[];
    clear(): void;
    size(): number;
}
