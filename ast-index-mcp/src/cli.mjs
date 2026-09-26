#!/usr/bin/env node
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { buildIncrementalASTGraph, loadASTGraph } from "../../components/ast-index/dist/cache.js";
import { computeTransitiveBlastRadius, findCallers, findSymbols } from "../../components/ast-index/dist/query.js";
import { getWorkspaceRoot } from "../../workspace-mcp/dist/path-policy.js";

function textResult(payload, isError = false) {
	return {
		content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
		...(isError ? { isError: true } : {}),
	};
}

function getGraph(targetDir) {
	const root = targetDir ? resolve(targetDir) : getWorkspaceRoot();
	return loadASTGraph(root) || buildIncrementalASTGraph(root);
}

async function handleScan(args) {
	const root = args.path ? resolve(args.path) : getWorkspaceRoot();
	const start = Date.now();
	const graph = buildIncrementalASTGraph(root);
	const duration = Date.now() - start;
	return textResult({
		ok: true,
		path: root,
		fileCount: Object.keys(graph.files).length,
		durationMs: duration,
		generatedAt: graph.generatedAt,
	});
}

async function handleFind(args) {
	const name = String(args.name ?? "").trim();
	if (!name) return textResult({ ok: false, error: "name parameter is required." }, true);
	const graph = getGraph(args.path);
	let matches = findSymbols(graph, name);
	if (args.exact) {
		matches = matches.filter((s) => s.name === name);
	}
	return textResult({
		ok: true,
		query: name,
		exact: Boolean(args.exact),
		matchCount: matches.length,
		symbols: matches.slice(0, 100),
	});
}

async function handleCallers(args) {
	const name = String(args.name ?? "").trim();
	if (!name) return textResult({ ok: false, error: "name parameter is required." }, true);
	const graph = getGraph(args.path);
	const callers = findCallers(graph, name);
	return textResult({
		ok: true,
		symbol: name,
		callerCount: callers.length,
		callers: callers.slice(0, 100),
	});
}

async function handleImpact(args) {
	const target = String(args.target ?? "").trim();
	if (!target) return textResult({ ok: false, error: "target parameter is required." }, true);
	const graph = getGraph(args.path);
	const type = args.type === "symbol" ? "symbol" : "file";
	const resolvedTarget = type === "file" ? resolve(target) : target;
	const impact = computeTransitiveBlastRadius(graph, resolvedTarget, type);
	return textResult({
		ok: true,
		target: resolvedTarget,
		targetType: type,
		totalCallSites: impact.totalCallSites,
		affectedFileCount: impact.affectedFiles.length,
		affectedTestCount: impact.affectedTestFiles.length,
		affectedFiles: impact.affectedFiles,
		affectedTestFiles: impact.affectedTestFiles,
		directCallers: impact.directCallers.slice(0, 50),
		indirectCallers: impact.indirectCallers.slice(0, 50),
	});
}

const TOOLS = [
	{
		name: "ast_index_scan",
		description: "Scan workspace and build/refresh incremental AST symbol graph across TypeScript, Python, Rust, and Go.",
		inputSchema: {
			type: "object",
			properties: { path: { type: "string", description: "Optional directory path to index. Defaults to workspace root." } }
		}
	},
	{
		name: "ast_index_find",
		description: "Search AST symbols (functions, classes, interfaces, types, structs, enums) by name or substring.",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Symbol name or substring to search for." },
				exact: { type: "boolean", description: "If true, only returns exact symbol name matches." },
				path: { type: "string", description: "Optional workspace directory path." }
			},
			required: ["name"]
		}
	},
	{
		name: "ast_index_callers",
		description: "Find all call sites and caller functions for a given symbol name.",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Function or symbol name being called." },
				path: { type: "string", description: "Optional workspace directory path." }
			},
			required: ["name"]
		}
	},
	{
		name: "ast_index_impact",
		description: "Calculate transitive blast radius and impact analysis for a file or symbol (traces multi-hop callers, affected files, and test files).",
		inputSchema: {
			type: "object",
			properties: {
				target: { type: "string", description: "Target file path or symbol name." },
				type: { type: "string", enum: ["file", "symbol"], description: "Whether target is a file or symbol name. Defaults to file." },
				path: { type: "string", description: "Optional workspace directory path." }
			},
			required: ["target"]
		}
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
				serverInfo: { name: "ast-index-mcp", version: "0.1.0" }
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
			case "ast_index_scan": return { jsonrpc: "2.0", id, result: await handleScan(args) };
			case "ast_index_find": return { jsonrpc: "2.0", id, result: await handleFind(args) };
			case "ast_index_callers": return { jsonrpc: "2.0", id, result: await handleCallers(args) };
			case "ast_index_impact": return { jsonrpc: "2.0", id, result: await handleImpact(args) };
			default:
				return { jsonrpc: "2.0", id, error: { code: -32601, message: `Tool not found: ${name}` } };
		}
	}
	if (id !== undefined) {
		return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
	}
	return null;
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
	const trimmed = line.trim();
	if (!trimmed) return;
	try {
		const request = JSON.parse(trimmed);
		const response = await handleJsonRpc(request);
		if (response) process.stdout.write(JSON.stringify(response) + "\n");
	} catch (err) {
		process.stdout.write(
			JSON.stringify({
				jsonrpc: "2.0",
				id: null,
				error: { code: -32700, message: "Parse error", data: String(err) }
			}) + "\n"
		);
	}
});
