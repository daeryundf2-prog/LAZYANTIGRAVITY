#!/usr/bin/env node
import { createInterface } from "node:readline";
import { LSP_TOOLS } from "./tools.js";

function handleJsonRpc(message) {
	if (!message || typeof message !== "object") return;
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
		return {
			jsonrpc: "2.0",
			id,
			result: {
				content: [{
					type: "text",
					text: JSON.stringify({ ok: true, tool: name, args, diagnostics: [] }, null, 2)
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
	rl.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			const req = JSON.parse(trimmed);
			const res = handleJsonRpc(req);
			if (res) {
				process.stdout.write(`${JSON.stringify(res)}\n`);
			}
		} catch (err) {
			process.stderr.write(`[lsp-tools-mcp] parse error: ${err.message}\n`);
		}
	});
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
		console.log("Usage: omo-lsp <mcp|diagnostics|symbols> [options]");
		return 0;
	}
	if (argv[0] === "mcp") {
		runMcpServer();
		return 0;
	}
	console.log(`[lsp-tools-mcp] Standalone LSP CLI initialized.`);
	return 0;
}

main();
