/**
 * Dynamic Antigravity Hook & Schema Discovery
 * Inspects host runtime environment and auto-binds supported hook capabilities.
 */
export interface DiscoveredHookCapability {
    readonly event: string;
    readonly supported: boolean;
    readonly failOpen: boolean;
    readonly timeoutMs: number;
}
export interface RuntimeDiscoveryReport {
    readonly runtime: "Antigravity" | "Codex" | "Standalone";
    readonly version: string;
    readonly capabilities: readonly DiscoveredHookCapability[];
    readonly dynamicDiscoveryActive: boolean;
}
export declare function discoverRuntimeHooks(env?: Record<string, string | undefined>): RuntimeDiscoveryReport;
