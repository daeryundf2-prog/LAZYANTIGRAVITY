#!/usr/bin/env node
import { SessionTreeManager } from "./tree-manager.js";
const args = process.argv.slice(2);
const command = args[0];
function main() {
    const cwd = process.cwd();
    const manager = new SessionTreeManager(cwd);
    if (command === "snapshot") {
        const label = args[1] || `Snapshot ${Date.now()}`;
        const node = manager.snapshot(label);
        console.log(`[Session-Tree] Created snapshot: [${node.id}] "${node.label}" (Git SHA: ${node.gitSha.slice(0, 7)})`);
    }
    else if (command === "fork") {
        const nodeId = args[1];
        if (!nodeId) {
            console.error("Usage: session-tree fork <nodeId>");
            process.exit(1);
        }
        const node = manager.fork(nodeId);
        console.log(`[Session-Tree] Forked/reverted filesystem to: [${node.id}] "${node.label}"`);
    }
    else if (command === "tree") {
        const treeView = manager.renderAsciiTree();
        console.log(treeView);
    }
    else if (command === "hook" && args[1] === "stop") {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "Stop",
                additionalContext: "",
            },
        }));
    }
    else {
        console.log("LazyAntigravity Session Tree CLI");
        console.log("Commands: snapshot <label> | fork <nodeId> | tree | hook stop");
    }
}
main();
