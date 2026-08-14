#!/usr/bin/env node
import { createInterface } from "node:readline";

const TOOLS = [
	{
		name: "ast_grep_search",
		description: "Search code using AST patterns across files in the workspace.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "AST pattern string to search for" },
				language: { type: "string", description: "Programming language (typescript, javascript, python, rust, go, etc.)" },
				paths: { type: "array", items: { type: "string" }, description: "Specific paths or globs to search within" }
			},
			required: ["pattern"]
		}
	},
	{
		name: "ast_grep_replace",
		description: "Perform AST structural code replacements across files.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "Target AST pattern" },
				rewrite: { type: "string", description: "Replacement AST template" },
				paths: { type: "array", items: { type: "string" }, description: "Paths to replace within" }
			},
			required: ["pattern", "rewrite"]
		}
	}
];

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
				serverInfo: { name: "ast-grep-mcp", version: "0.1.0" }
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
			result: { tools: TOOLS }
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
					text: JSON.stringify({ ok: true, tool: name, args, matches: [] }, null, 2)
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
			process.stderr.write(`[ast-grep-mcp] parse error: ${err.message}\n`);
		}
	});
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
		console.log("Usage: omo-ast-grep <mcp|search|replace> [options]");
		return 0;
	}
	if (argv[0] === "mcp") {
		runMcpServer();
		return 0;
	}
	console.log(`[ast-grep-mcp] Standalone AST grep CLI initialized.`);
	return 0;
}

main();
