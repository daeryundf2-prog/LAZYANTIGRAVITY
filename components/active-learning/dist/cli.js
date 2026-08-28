#!/usr/bin/env node
import { extractFailurePatterns, readFailureEvents } from "./analyzer.js";
import { evolveRules } from "./evolver.js";
const args = process.argv.slice(2);
const command = args[0];
function parseArgs(argv) {
    const approve = argv.includes("--approve");
    let evidenceJson;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--evidence-json" && argv[i + 1]) {
            evidenceJson = argv[i + 1];
            break;
        }
        if (argv[i]?.startsWith("--evidence-json=")) {
            evidenceJson = argv[i]?.slice("--evidence-json=".length);
            break;
        }
    }
    return { approve, evidenceJson };
}
function main() {
    const cwd = process.cwd();
    const opts = parseArgs(args);
    if (command === "analyze") {
        const events = readFailureEvents(cwd);
        const patterns = extractFailurePatterns(events);
        console.log("=== Active Learning Telemetry Analysis ===");
        console.log(`- Total Failure Events Scanned: ${events.length}`);
        console.log(`- Significant Error Clusters: ${patterns.length}`);
        for (const p of patterns) {
            console.log(`  * [Occurrences: ${p.occurrences}, Conf: ${(p.confidence * 100).toFixed(0)}%] ${p.suggestedRule}`);
        }
    }
    else if (command === "evolve") {
        try {
            const report = evolveRules(cwd, opts);
            console.log("=== Rule Evolution Execution ===");
            console.log(`- Analyzed Events: ${report.analyzedEvents}`);
            console.log(`- Identified Patterns: ${report.identifiedPatterns}`);
            console.log(`- Promoted Gotchas to Active Memory: ${report.promotedGotchas.length}`);
            for (const g of report.promotedGotchas) {
                console.log(`  + Promoted: ${g.suggestedRule}`);
            }
        }
        catch (err) {
            console.error(`[active-learning] Error: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
        }
    }
    else if (command === "hook" && args[1] === "stop") {
        // The hook is deliberately analyze-only: rule promotion requires an
        // explicit `evolve --approve --evidence-json ...` invocation with a
        // verified evidence envelope, so sessions are never mutated here.
        let context = "";
        try {
            const events = readFailureEvents(cwd);
            const patterns = extractFailurePatterns(events);
            if (patterns.length > 0) {
                context = `Active-learning analysis (read-only): scanned ${events.length} failure event(s), found ${patterns.length} significant cluster(s). Promotion requires an explicit approved evolve run.`;
            }
        }
        catch { }
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "Stop",
                additionalContext: context,
            },
        }));
    }
    else {
        console.log("LazyAntigravity Active Learning CLI");
        console.log("Commands: analyze | evolve [--approve --evidence-json <path/json>] | hook stop");
    }
}
main();
