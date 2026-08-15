#!/usr/bin/env node
import { createInterface } from "node:readline";
import { LSP_TOOLS, executeLspDiagnostics, executeLspSymbols } from "./tools.js";

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
				serverInfo: { name: "lsp-tools-mcp", version: "0.1.0" }
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
