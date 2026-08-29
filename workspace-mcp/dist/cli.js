#!/usr/bin/env node
// Workspace MCP server: exposes the plugin's local workspace state
// (active memory, IPC blackboard, session tree) as native MCP tools so
// agents do not have to shell out to component CLIs.
//
// All tools are local-only. The daemon-backed blackboard uses the same
// token-authenticated Unix socket / named pipe as the daemon-bridge CLI.
import { createInterface } from "node:readline";
import { resolve, sep } from "node:path";

import { DaemonClient } from "../../components/daemon-bridge/dist/client.js";
import { getDaemonPaths } from "../../components/daemon-bridge/dist/server.js";
import { searchMemoryFacts } from "../../components/memory/dist/search.js";
import { SessionTreeManager } from "../../components/session-tree/dist/tree-manager.js";

const FORK_GATE_ENV = "LAZYANTIGRAVITY_SESSION_TREE_FORK";
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_LIST_ENTRIES = 100;

function getWorkspaceRoot() {
	return process.env["LAZYANTIGRAVITY_WORKSPACE_ROOT"] || process.cwd();
}

function textResult(payload, isError = false) {
	return {
		content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
		...(isError ? { isError: true } : {}),
	};
}

async function withDaemon(action) {
	const client = new DaemonClient(getDaemonPaths(getWorkspaceRoot()));
	const status = await client.status().catch(() => null);
	if (!status) {
		return textResult(
			{
				ok: false,
				error:
					"IPC daemon is not running in this workspace. Start it with " +
					"`node <plugin>/components/daemon-bridge/dist/cli.js daemon start` " +
					"(the SessionStart hook usually does this automatically).",
			},
			true,
		);
	}
	try {
		return await action(client);
	} catch (err) {
		return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) }, true);
	}
}

function coerceValue(raw) {
	if (raw === undefined || raw === null) return raw;
	if (typeof raw === "string") {
		if (Buffer.byteLength(raw, "utf8") > MAX_VALUE_BYTES) {
			throw new Error(`Value exceeds the ${MAX_VALUE_BYTES} byte limit.`);
		}
		return raw;
	}
	const encoded = JSON.stringify(raw);
	if (Buffer.byteLength(encoded, "utf8") > MAX_VALUE_BYTES) {
		throw new Error(`Value exceeds the ${MAX_VALUE_BYTES} byte limit.`);
	}
	return raw;
}

async function blackboardSet(args) {
	if (typeof args.key !== "string" || args.key.length === 0) {
		return textResult({ ok: false, error: "key must be a non-empty string." }, true);
	}
	let value;
	try {
		value = coerceValue(args.value);
	} catch (err) {
		return textResult({ ok: false, error: err.message }, true);
	}
	const options = {};
	if (Number.isFinite(args.ttlMs) && args.ttlMs > 0) options.ttlMs = args.ttlMs;
	if (typeof args.namespace === "string" && args.namespace.length > 0) options.namespace = args.namespace;
	return withDaemon(async (client) => {
		const entry = await client.set(args.key, value, options);
		if (!entry) return textResult({ ok: false, error: "Daemon rejected the write." }, true);
		return textResult({ ok: true, entry });
	});
}

async function blackboardGet(args) {
	if (typeof args.key !== "string" || args.key.length === 0) {
		return textResult({ ok: false, error: "key must be a non-empty string." }, true);
	}
	return withDaemon(async (client) => {
		const value = await client.get(args.key);
		return textResult({ ok: true, key: args.key, value });
	});
}

async function blackboardList(args) {
	const namespace = typeof args.namespace === "string" && args.namespace.length > 0 ? args.namespace : undefined;
	return withDaemon(async (client) => {
		const entries = (await client.list(namespace)).slice(0, MAX_LIST_ENTRIES);
		return textResult({ ok: true, namespace: namespace ?? null, entries, total: entries.length });
	});
}

async function memorySearch(args) {
	const query = typeof args.query === "string" ? args.query.trim() : "";
	if (!query) return textResult({ ok: false, error: "query must be a non-empty string." }, true);
	try {
		const result = searchMemoryFacts(getWorkspaceRoot(), query, args.category);
		return textResult({ ok: true, ...result });
	} catch (err) {
		return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) }, true);
	}
}

async function sessionTreeSnapshot(args) {
	const label = typeof args.label === "string" && args.label.trim() ? args.label.trim() : `Snapshot ${Date.now()}`;
	try {
		const manager = new SessionTreeManager(getWorkspaceRoot());
		const node = manager.snapshot(label);
		return textResult({ ok: true, node });
	} catch (err) {
		return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) }, true);
	}
}

async function sessionTreeFork(args) {
	if (process.env[FORK_GATE_ENV] !== "1") {
		return textResult(
			{
				ok: false,
				error:
					`session_tree_fork reverts the working tree and requires the ${FORK_GATE_ENV}=1 ` +
					"environment opt-in (set it in mcp_config.json env for this server).",
			},
			true,
		);
	}
	if (typeof args.nodeId !== "string" || args.nodeId.length === 0) {
		return textResult({ ok: false, error: "nodeId is required." }, true);
	}
	try {
		const manager = new SessionTreeManager(getWorkspaceRoot());
		const node = manager.fork(args.nodeId);
		return textResult({ ok: true, node });
	} catch (err) {
		return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) }, true);
	}
}

async function sessionTreeRender() {
	try {
		const manager = new SessionTreeManager(getWorkspaceRoot());
		return textResult({ ok: true, tree: manager.renderAsciiTree() });
	} catch (err) {
		return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) }, true);
	}
}

const TOOLS = [
	{
		name: "memory_search",
		description: "Search the workspace's persisted active memory (facts.jsonl) for facts and learned gotchas.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", description: "Substring to search for" },
				category: { type: "string", description: "Optional category filter (e.g. gotcha)" }
			},
			required: ["query"]
		}
	},
	{
		name: "blackboard_set",
		description: "Write a value to the token-authed local IPC blackboard (cross-agent scratchpad).",
		inputSchema: {
			type: "object",
			properties: {
				key: { type: "string" },
				value: { description: "Value to store (string or JSON; 64KB limit)" },
				ttlMs: { type: "number", description: "Optional time-to-live in milliseconds" },
				namespace: { type: "string", description: "Optional namespace" }
			},
			required: ["key", "value"]
		}
	},
	{
		name: "blackboard_get",
		description: "Read a value from the local IPC blackboard.",
		inputSchema: {
			type: "object",
			properties: { key: { type: "string" } },
			required: ["key"]
		}
	},
	{
		name: "blackboard_list",
		description: "List blackboard entries, optionally by namespace.",
		inputSchema: {
			type: "object",
			properties: { namespace: { type: "string" } }
		}
	},
	{
		name: "session_tree_snapshot",
		description: "Create a non-destructive session-tree snapshot of the full working tree (shadow git ref; does not touch HEAD or the index).",
		inputSchema: {
			type: "object",
			properties: { label: { type: "string" } }
		}
	},
	{
		name: "session_tree_fork",
		description: `Restore the working tree to a session-tree node. Destructive: requires the ${FORK_GATE_ENV}=1 opt-in.`,
		inputSchema: {
			type: "object",
			properties: { nodeId: { type: "string" } },
			required: ["nodeId"]
		}
	},
	{
		name: "session_tree_render",
		description: "Render the session hypothesis tree as ASCII.",
		inputSchema: { type: "object", properties: {} }
	}
];

async function handleJsonRpc(message) {
	if (!message || typeof message !== "object") return null;
	const { id, method, params } = message;

	if (method === "initialize") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "workspace-mcp", version: "0.1.0" }
			}
		};
	}
	if (method === "notifications/initialized") return null;
	if (method === "tools/list") {
		return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
	}
	if (method === "tools/call") {
		const name = params?.name;
		const args = params?.arguments ?? {};
		switch (name) {
			case "memory_search": return { jsonrpc: "2.0", id, result: await memorySearch(args) };
			case "blackboard_set": return { jsonrpc: "2.0", id, result: await blackboardSet(args) };
			case "blackboard_get": return { jsonrpc: "2.0", id, result: await blackboardGet(args) };
			case "blackboard_list": return { jsonrpc: "2.0", id, result: await blackboardList(args) };
			case "session_tree_snapshot": return { jsonrpc: "2.0", id, result: await sessionTreeSnapshot(args) };
			case "session_tree_fork": return { jsonrpc: "2.0", id, result: await sessionTreeFork(args) };
			case "session_tree_render": return { jsonrpc: "2.0", id, result: await sessionTreeRender() };
			default:
				return {
					jsonrpc: "2.0",
					id,
					error: { code: -32602, message: `Unsupported tool: ${name}` }
				};
		}
	}
	return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}


// Startup guard: if the host launched this server from inside the plugin
// tree, workspace-scoped tools would silently operate on the plugin instead
// of the user's project. Warn loudly; do not refuse to run.
function warnIfWorkspaceLooksLikePluginRoot(name) {
	const pluginRoot = process.env["PLUGIN_ROOT"];
	if (!pluginRoot) return;
	const cwd = resolve(process.cwd());
	const root = resolve(pluginRoot);
	if (cwd === root || cwd.startsWith(root + sep)) {
		process.stderr.write(
			`[${name}] WARNING: cwd is inside PLUGIN_ROOT (${pluginRoot}); workspace-scoped tools would operate on the plugin tree, not the user's workspace. Set the server "cwd" to the user workspace in mcp_config.json, or set LAZYANTIGRAVITY_WORKSPACE_ROOT.\n`,
		);
	}
}

warnIfWorkspaceLooksLikePluginRoot("workspace-mcp");

async function runMcpServer() {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	rl.on("line", async (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			const req = JSON.parse(trimmed);
			const res = await handleJsonRpc(req);
			if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
		} catch {
			process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
		}
	});
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
		console.log("Usage: workspace-mcp <mcp> [options]");
		return 0;
	}
	if (argv[0] === "mcp") {
		runMcpServer();
		return 0;
	}
	console.log("[workspace-mcp] Standalone workspace CLI initialized.");
	return 0;
}

main();
