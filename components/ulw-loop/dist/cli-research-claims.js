import { hasFlag, readValue } from "./cli-arg-parser.js";
import { printJson } from "./cli-output.js";
import { validateClaimLedger } from "./research-claims.js";
import { UlwLoopError } from "./types.js";
export async function researchClaimsCmd(repoRoot, argv, json) {
    const file = readValue(argv, "--file") || readValue(argv, "--ledger");
    if (!file) {
        throw new UlwLoopError("Missing --file (path to claim-ledger.md)", "ULW_LOOP_ARGUMENT_MISSING");
    }
    const synthesis = readValue(argv, "--synthesis") || undefined;
    const enforce = hasFlag(argv, "--enforce");
    const report = await validateClaimLedger(repoRoot, {
        ledgerFile: file,
        ...(synthesis ? { synthesisFile: synthesis } : {}),
    });
    if (json) {
        printJson(report);
    }
    else {
        process.stdout.write(`=== Research Claims Gate ===\n`);
        process.stdout.write(`Ledger File: ${report.ledgerFile}\n`);
        if (report.synthesisFile)
            process.stdout.write(`Synthesis File: ${report.synthesisFile}\n`);
        process.stdout.write(`Total Claims: ${report.totalClaims} (Verified: ${report.verifiedCount}, Refuted: ${report.refutedCount}, Unresolved: ${report.unresolvedCount})\n`);
        process.stdout.write(`Result: ${report.ok ? "PASS" : "FAIL"} (${report.passCount} passed, ${report.failCount} failed)\n\n`);
        if (report.violations.length > 0) {
            process.stdout.write(`Violations (${report.violations.length}):\n`);
            for (const v of report.violations) {
                process.stdout.write(`  [${v.claimId}] ${v.violation}\n`);
            }
        }
        else {
            process.stdout.write(`No violations found across all claim records.\n`);
        }
    }
    if (enforce && !report.ok) {
        return 1;
    }
    return 0;
}
