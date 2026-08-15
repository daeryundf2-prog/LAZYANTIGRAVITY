#!/usr/bin/env node
import { stdout as processStdout } from "node:process";
import { readFacts, saveFact, formatActiveMemoryContext } from "./store.js";
const command = process.argv[2];
const subcommand = process.argv[3];
if (command === "hook" && subcommand === "session-start") {
    const facts = readFacts();
    const context = formatActiveMemoryContext(facts);
    if (context.length > 0) {
        const output = {
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: context,
            },
        };
        processStdout.write(`${JSON.stringify(output)}\n`);
    }
}
else if (command === "remember") {
    const text = process.argv.slice(3).join(" ");
    if (text.trim().length > 0) {
        const saved = saveFact(text, "fact");
        if (saved) {
            console.log(`Saved fact: ${saved.content}`);
        }
        else {
            console.log("Fact already exists or is empty.");
        }
    }
    else {
        process.stderr.write("Usage: omo-memory remember <fact text>\n");
    }
}
else if (command === "list") {
    const facts = readFacts();
    console.log(`=== Active Memory Facts (${facts.length}) ===`);
    for (const f of facts) {
        console.log(`[${new Date(f.timestamp).toISOString()}] (${f.category}) ${f.content}`);
    }
}
else {
    process.stderr.write("Usage: omo-memory hook session-start | remember <text> | list\n");
    process.exitCode = 1;
}
