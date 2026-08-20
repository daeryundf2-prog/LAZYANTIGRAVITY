#!/usr/bin/env node
import { readFailureEvents, extractFailurePatterns } from "./analyzer.js";
import { evolveRules } from "./evolver.js";
const args = process.argv.slice(2);
const command = args[0];
function main() {
    const cwd = process.cwd();
    if (command === "analyze") {
        const events = readFailureEvents(cwd);
        const patterns = extractFailurePatterns(events);
        console.log(`=== Active Learning Telemetry Analysis ===`);
        console.log(`- Total Failure Events Scanned: ${events.length}`);
        console.log(`- Significant Error Clusters: ${patterns.length}`);
        for (const p of patterns) {
            console.log(`  * [Occurrences: ${p.occurrences}, Conf: ${(p.confidence * 100).toFixed(0)}%] ${p.suggestedRule}`);
        }
    }
    else if (command === "evolve") {
        const report = evolveRules(cwd);
        console.log(`=== Rule Evolution Execution ===`);
        console.log(`- Analyzed Events: ${report.analyzedEvents}`);
        console.log(`- Identified Patterns: ${report.identifiedPatterns}`);
        console.log(`- Promoted Gotchas to Active Memory: ${report.promotedGotchas.length}`);
        for (const g of report.promotedGotchas) {
            console.log(`  + Promoted: ${g.suggestedRule}`);
        }
    }
    else if (command === "hook" && args[1] === "stop") {
        try {
            evolveRules(cwd);
        }
        catch { }
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "Stop",
                additionalContext: "",
            },
        }));
    }
    else {
        console.log("LazyAntigravity Active Learning CLI");
        console.log("Commands: analyze | evolve | hook stop");
    }
}
main();
