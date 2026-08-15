#!/usr/bin/env node
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { runQuickLaneHook } from "./codex-hook.js";
const command = process.argv[2];
const subcommand = process.argv[3];
if (command === "hook" && subcommand === "user-prompt-submit") {
    await runHookCli();
}
else {
    process.stderr.write("Usage: omo-quick-lane hook user-prompt-submit\n");
    process.exitCode = 1;
}
async function runHookCli() {
    const raw = await readStdin();
    if (raw.trim().length === 0)
        return;
    try {
        const parsed = JSON.parse(raw);
        const output = runQuickLaneHook(parsed);
        if (output.length > 0) {
            processStdout.write(output);
        }
    }
    catch {
        // Ignore malformed input
    }
}
function readStdin() {
    return new Promise((resolve) => {
        let data = "";
        processStdin.setEncoding("utf8");
        processStdin.on("data", (chunk) => {
            data += chunk;
        });
        processStdin.once("error", () => {
            resolve(data);
        });
        processStdin.once("end", () => {
            resolve(data);
        });
    });
}
