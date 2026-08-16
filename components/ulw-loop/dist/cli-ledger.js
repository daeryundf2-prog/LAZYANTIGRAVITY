import { readValue } from "./cli-arg-parser.js";
import { printJson } from "./cli-output.js";
import { verifyLedgerIntegrity } from "./ledger-integrity.js";
import { normalizeUlwLoopSessionId, resolveUlwLoopSessionIdFromEnv } from "./paths.js";
export async function verifyLedgerCmd(repoRoot, argv, json, scope) {
    const explicitRunId = readValue(argv, "--run-id")?.trim();
    const runId = explicitRunId ?? normalizeUlwLoopSessionId(scope?.sessionId) ?? resolveUlwLoopSessionIdFromEnv() ?? "default-run";
    const result = await verifyLedgerIntegrity(repoRoot, runId);
    if (json)
        printJson({ ok: result.valid, ...result });
    else if (result.valid) {
        process.stdout.write(`Ledger integrity verified for run ${runId}: ${result.eventCount} event(s), hash chain valid.\n`);
    }
    else {
        process.stdout.write(`Ledger integrity FAILED for run ${runId}: index ${result.brokenIndex} (${result.eventCount} events):\n`);
        process.stdout.write(`  expected ${result.expectedHash}\n  actual   ${result.actualHash}\n`);
    }
    return result.valid ? 0 : 1;
}
