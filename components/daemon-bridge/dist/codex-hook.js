import { spawn } from "node:child_process";
import { getDaemonPaths } from "./server.js";
import { DaemonClient } from "./client.js";
export async function handleSessionStartHook(pluginRoot) {
    const paths = getDaemonPaths();
    const client = new DaemonClient(paths);
    const runningStatus = await client.status();
    if (!runningStatus) {
        // Spawn daemon server detached
        const cliPath = `${pluginRoot}/components/daemon-bridge/dist/cli.js`;
        const child = spawn(process.execPath, [cliPath, "daemon", "start", "--foreground"], {
            detached: true,
            stdio: "ignore",
            cwd: process.cwd(),
        });
        child.unref();
    }
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: "",
        },
    });
}
export function handleStopHook() {
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: "",
        },
    });
}
