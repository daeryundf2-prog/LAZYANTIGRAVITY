/**
 * Egress Network Sandbox & Domain Whitelist Auditor
 * Enforces network safety and prevents unauthorized outbound data leaks.
 */
export interface EgressAuditResult {
    readonly allowed: boolean;
    readonly domain: string;
    readonly reason?: string;
}
export declare function parseDomainFromUrl(targetUrl: string): string | null;
export declare function auditEgressRequest(targetUrl: string, customWhitelist?: readonly string[]): EgressAuditResult;
