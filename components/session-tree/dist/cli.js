#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SessionTreeManager } from "./tree-manager.js";
const args = process.argv.slice(2);
const command = args[0];
function buildStopContext(cwd) {
    // Only checkpoint sessions that actually use the session tree; taking
    // snapshots for every session would surprise users who never opted in.
    // Deliberately probes for nodes.json without calling getTreeStoragePath,
    // which would create the storage directory as a side effect.
    if (!existsSync(join(cwd, ".lazyantigravity", "session-tree", "nodes.json"))) {
        return "Session tree not initialized in this workspace; no checkpoint taken.";
    }
    try {
        const manager = new SessionTreeManager(cwd);
        const node = manager.snapshot(`Auto-checkpoint ${new Date().toISOString()}`);
        return `Session tree checkpoint created: [${node.id}] "${node.label}" (git ${node.gitSha.slice(0, 7)}).`;
    }
    catch (err) {
        return `Session tree checkpoint failed: ${err instanceof Error ? err.message : String(err)}`;
    }
}
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
        const context = buildStopContext(cwd);
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "Stop",
                additionalContext: context,
            },
        }));
    }
    else {
        console.log("LazyAntigravity Session Tree CLI");
        console.log("Commands: snapshot <label> | fork <nodeId> | tree | hook stop");
    }
}
main();
