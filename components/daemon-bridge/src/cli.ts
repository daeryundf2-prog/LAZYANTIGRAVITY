#!/usr/bin/env node
import { DaemonServer, getDaemonPaths } from "./server.js";
import { DaemonClient } from "./client.js";
import { handleSessionStartHook, handleStopHook } from "./codex-hook.js";

const args = process.argv.slice(2);
const command = args[0];
const sub = args[1];

async function main() {
	const paths = getDaemonPaths();
	const client = new DaemonClient(paths);

	if (command === "daemon" && sub === "start") {
		const server = new DaemonServer(paths);
		await server.start();
		console.log(`[Daemon-Bridge] IPC Daemon started at: ${paths.socketPath} (PID: ${process.pid})`);

		if (!args.includes("--foreground")) {
			// Keep process alive if foreground
		}
	} else if (command === "daemon" && sub === "stop") {
		try {
			await client.send({ cmd: "STOP" });
			console.log("[Daemon-Bridge] Daemon stop signal sent.");
		} catch {
			console.log("[Daemon-Bridge] Daemon is not running.");
		}
	} else if (command === "daemon" && sub === "status") {
		const status = await client.status();
		if (status) {
			console.log("=== Daemon Bridge Status ===");
			console.log(JSON.stringify(status, null, 2));
		} else {
			console.log("[Daemon-Bridge] Daemon is not running.");
		}
	} else if (command === "get") {
		const key = args[1];
		if (!key) {
			console.error("Usage: daemon-bridge get <key>");
			process.exit(1);
		}
		const val = await client.get(key);
		console.log(JSON.stringify(val, null, 2));
	} else if (command === "set") {
		const key = args[1];
		const val = args[2];
		const ttlMs = args[3] ? parseInt(args[3], 10) : undefined;
		if (!key || val === undefined) {
			console.error("Usage: daemon-bridge set <key> <value> [ttlMs]");
			process.exit(1);
		}
		const entry = await client.set(key, val, { ttlMs });
		console.log(`[Daemon-Bridge] Saved key "${key}":`, JSON.stringify(entry));
	} else if (command === "list") {
		const ns = args[1];
		const entries = await client.list(ns);
		console.log(`=== Blackboard Entries (${entries.length}) ===`);
		for (const e of entries) {
			console.log(`- [${e.namespace}] ${e.key}: ${JSON.stringify(e.value)}`);
		}
	} else if (command === "hook" && sub === "session-start") {
		const pluginRoot = process.env.PLUGIN_ROOT || process.cwd();
		const out = await handleSessionStartHook(pluginRoot);
		process.stdout.write(out);
	} else if (command === "hook" && sub === "stop") {
		const out = handleStopHook();
		process.stdout.write(out);
	} else {
		console.log("LazyAntigravity Daemon Bridge CLI");
		console.log("Commands: daemon <start|stop|status> | get <key> | set <key> <val> | list | hook <session-start|stop>");
	}
}

main().catch((err) => {
	console.error("[Daemon-Bridge] Error:", err.message);
	process.exit(1);
});
