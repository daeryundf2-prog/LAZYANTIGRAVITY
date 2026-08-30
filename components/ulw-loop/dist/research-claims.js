import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractUniqueDomains, parseMarkdownTable } from "./research-claims-parser.js";
const INVALID_COUNTER_STRINGS = new Set(["n/a", "na", "-", "—", "none", "null", ""]);
function findColumn(row, pattern) {
    for (const key of Object.keys(row)) {
        if (pattern.test(key))
            return row[key] ?? "";
    }
    return "";
}
function parseClaimId(rawClaim, index) {
    const match = /\[?Claim\s*([A-Za-z0-9._-]+)\]?/i.exec(rawClaim);
    return match?.[1] ? `Claim ${match[1]}` : `Claim ${index + 1}`;
}
export async function validateClaimLedger(repoRoot, options) {
    const ledgerPath = resolve(repoRoot, options.ledgerFile);
    if (!existsSync(ledgerPath)) {
        throw new Error(`Claim ledger file not found: ${options.ledgerFile}`);
    }
    const content = await readFile(ledgerPath, "utf8");
    const rawRows = parseMarkdownTable(content);
    const rows = [];
    const violations = [];
    let verifiedCount = 0;
    let refutedCount = 0;
    let unresolvedCount = 0;
    for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        if (!raw)
            continue;
        const rawClaim = findColumn(raw, /claim/i);
        const claimId = parseClaimId(rawClaim, i);
        const riskLevel = findColumn(raw, /risk/i);
        const sources = findColumn(raw, /source/i);
        const counterSearch = findColumn(raw, /counter/i);
        const primarySource = findColumn(raw, /primary/i);
        const rawStatus = findColumn(raw, /status/i).trim();
        const normStatus = rawStatus.toUpperCase();
        const rowViolations = [];
        const domains = extractUniqueDomains(sources);
        let status = "INVALID";
        if (normStatus === "VERIFIED") {
            status = "VERIFIED";
            verifiedCount++;
            if (domains.length < 2) {
                const msg = `Domain independence failed: fewer than 2 distinct domains (found: ${domains.join(", ") || "none"})`;
                rowViolations.push(msg);
                violations.push({ claimId, violation: msg });
            }
            const counterNorm = counterSearch.trim().toLowerCase();
            if (INVALID_COUNTER_STRINGS.has(counterNorm)) {
                const msg = "Counter-search missing or empty for verified claim";
                rowViolations.push(msg);
                violations.push({ claimId, violation: msg });
            }
            const primaryNorm = primarySource.trim();
            if (!primaryNorm || INVALID_COUNTER_STRINGS.has(primaryNorm.toLowerCase()) || (!primaryNorm.includes("/") && !primaryNorm.includes("."))) {
                const msg = "Primary source missing or invalid for verified claim";
                rowViolations.push(msg);
                violations.push({ claimId, violation: msg });
            }
        }
        else if (normStatus === "REFUTED") {
            status = "REFUTED";
            refutedCount++;
        }
        else if (normStatus === "UNRESOLVED") {
            status = "UNRESOLVED";
            unresolvedCount++;
        }
        else {
            const msg = `Invalid status '${rawStatus}'. Must be VERIFIED, REFUTED, or UNRESOLVED`;
            rowViolations.push(msg);
            violations.push({ claimId, violation: msg });
        }
        rows.push({
            claimId,
            claim: rawClaim,
            riskLevel,
            sources,
            domains,
            counterSearch,
            primarySource,
            status,
            rawStatus,
            violations: rowViolations,
        });
    }
    if (options.synthesisFile) {
        const synthPath = resolve(repoRoot, options.synthesisFile);
        if (existsSync(synthPath)) {
            const synthContent = await readFile(synthPath, "utf8");
            const citationRegex = /\[Claim\s*([A-Za-z0-9._-]+)\]/gi;
            let match;
            while ((match = citationRegex.exec(synthContent)) !== null) {
                const citedId = `Claim ${match[1]}`;
                const found = rows.find((r) => r.claimId.toLowerCase() === citedId.toLowerCase());
                if (!found) {
                    violations.push({ claimId: citedId, violation: `Cited in ${options.synthesisFile} but not found in ledger` });
                }
                else if (found.status !== "VERIFIED") {
                    violations.push({ claimId: citedId, violation: `Cited in ${options.synthesisFile} but status is ${found.status}` });
                }
            }
        }
    }
    const passCount = rows.filter((r) => r.violations.length === 0).length;
    const failCount = rows.length - passCount;
    return {
        ok: violations.length === 0,
        ledgerFile: options.ledgerFile,
        ...(options.synthesisFile ? { synthesisFile: options.synthesisFile } : {}),
        totalClaims: rows.length,
        verifiedCount,
        refutedCount,
        unresolvedCount,
        passCount,
        failCount,
        rows,
        violations,
    };
}
