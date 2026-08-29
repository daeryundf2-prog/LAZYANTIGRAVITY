#!/usr/bin/env node
import { createInterface } from "node:readline";
import { resolve, sep } from "node:path";
import { LSP_TOOLS, executeLspDefinitions, executeLspDiagnostics, executeLspReferences, executeLspSymbols } from "./tools.js";

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
				serverInfo: { name: "lsp-tools-mcp", version: "0.2.0" }
			}
		};
	}

	if (method === "notifications/initialized") {
		return null;
	}

	if (method === "tools/list") {
		return {
			jsonrpc: "2.0",
			id,
			result: { tools: LSP_TOOLS }
		};
	}

	if (method === "tools/call") {
		const name = params?.name;
		const args = params?.arguments ?? {};

		const toolDef = LSP_TOOLS.find((t) => t.name === name);
		if (!toolDef) {
			return {
				jsonrpc: "2.0",
				id,
				error: { code: -32602, message: `Unsupported tool: ${name}` }
			};
		}

		if (name === "lsp_diagnostics") {
			const res = await executeLspDiagnostics(args);
			return {
				jsonrpc: "2.0",
				id,
				result: res
			};
		}

		if (name === "lsp_definitions") {
			const res = await executeLspDefinitions(args);
			return {
				jsonrpc: "2.0",
				id,
				result: res
			};
		}

		if (name === "lsp_references") {
			const res = await executeLspReferences(args);
			return {
				jsonrpc: "2.0",
				id,
				result: res
			};
		}

		if (name === "lsp_symbols") {
			const res = await executeLspSymbols(args);
			return {
				jsonrpc: "2.0",
				id,
				result: res
			};
		}

		return {
			jsonrpc: "2.0",
			id,
			result: {
				content: [{
					type: "text",
					text: JSON.stringify({ ok: true, tool: name, args, message: `Executed ${name}` }, null, 2)
				}]
			}
		};
	}

	return {
		jsonrpc: "2.0",
		id,
		error: { code: -32601, message: `Method not found: ${method}` }
	};
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

warnIfWorkspaceLooksLikePluginRoot("lsp-tools-mcp");

async function runMcpServer() {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	rl.on("line", async (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			const req = JSON.parse(trimmed);
			const res = await handleJsonRpc(req);
			if (res) {
				process.stdout.write(`${JSON.stringify(res)}\n`);
			}
		} catch (err) {
			process.stdout.write(
				`${JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: { code: -32700, message: "Parse error" }
				})}\n`
			);
		}
	});
}

runMcpServer();
