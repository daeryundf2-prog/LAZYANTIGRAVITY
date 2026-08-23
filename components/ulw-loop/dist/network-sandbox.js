/**
 * Egress Network Sandbox & Domain Whitelist Auditor
 * Enforces network safety and prevents unauthorized outbound data leaks.
 */
const DEFAULT_ALLOWED_DOMAINS = new Set([
    "localhost",
    "127.0.0.1",
    "github.com",
    "api.github.com",
    "registry.npmjs.org",
    "googleapis.com",
    "generativelanguage.googleapis.com",
]);
export function parseDomainFromUrl(targetUrl) {
    try {
        const parsed = new URL(targetUrl);
        return parsed.hostname.toLowerCase();
    }
    catch {
        return null;
    }
}
export function auditEgressRequest(targetUrl, customWhitelist) {
    const domain = parseDomainFromUrl(targetUrl);
    if (!domain) {
        return { allowed: false, domain: "", reason: `Malformed URL or unparseable domain: "${targetUrl}"` };
    }
    const allowedSet = new Set(DEFAULT_ALLOWED_DOMAINS);
    if (customWhitelist) {
        for (const d of customWhitelist) {
            allowedSet.add(d.toLowerCase());
        }
    }
    const isAllowed = allowedSet.has(domain) || Array.from(allowedSet).some((allowed) => domain.endsWith(`.${allowed}`));
    if (!isAllowed) {
        return {
            allowed: false,
            domain,
            reason: `Egress to domain "${domain}" is blocked by network sandbox policy.`,
        };
    }
    return { allowed: true, domain };
}
