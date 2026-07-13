#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { env, stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { publicDiagnostic, redactText, redactValue } from "./database-mcp/redaction.mjs";
import { DatabaseBoundaryError, executeReadOnlyQuery } from "./database-mcp/sqlite-readonly.mjs";

const INPUT_LIMIT = 1024 * 1024;
const RESPONSE_LIMIT = 1024 * 1024;
const CONFIG_LIMIT = 1024 * 1024;
const ID_LIMIT = 256;
const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2025-06-18", "2024-11-05"]);

export const DATABASE_TOOLS = Object.freeze([
	{
		name: "db_list_connections",
		description: "List redacted metadata for saved SQLite-only connections without modifying configuration.",
		inputSchema: { type: "object", properties: {}, additionalProperties: false },
	},
	{
		name: "db_query",
		description: "Run one bounded read-only SQLite SELECT and return redacted JSON from an existing local SQLite database.",
		inputSchema: {
			type: "object",
			properties: {
				databasePath: { type: "string", description: "Path to an existing SQLite database file." },
				query: { type: "string", description: "One read-only SELECT statement." },
				format: { type: "string", enum: ["json"], default: "json" },
			},
			required: ["databasePath", "query"],
			additionalProperties: false,
		},
	},
]);

function validRequestId(id) {
	return id === null
		|| (typeof id === "number" && Number.isFinite(id))
		|| (typeof id === "string" && Buffer.byteLength(id) <= ID_LIMIT);
}

function writeResponse(response) {
	const line = `${JSON.stringify(response)}\n`;
	if (Buffer.byteLength(line) <= RESPONSE_LIMIT) return stdout.write(line);
	const fallback = {
		jsonrpc: "2.0",
		id: validRequestId(response.id) ? response.id : null,
		error: { code: -32603, message: "Response limit exceeded" },
	};
	return stdout.write(`${JSON.stringify(fallback)}\n`);
}

function sendResponse(id, result) {
	writeResponse({ jsonrpc: "2.0", id: validRequestId(id) ? id : null, result });
}

function sendError(id, code, message) {
	writeResponse({
		jsonrpc: "2.0",
		id: validRequestId(id) ? id : null,
		error: { code, message: redactText(message, 1024) },
	});
}

function toolResult(text, isError = false) {
	return { content: [{ type: "text", text }], isError };
}

function configPath() {
	const home = env.HOME || env.USERPROFILE || "";
	return join(env.SQLIT_CONFIG_DIR || join(home, ".config", "sqlit"), "connections.json");
}

function listConnections() {
	const path = configPath();
	if (!existsSync(path)) return toolResult(JSON.stringify({ connections: {} }));
	try {
		const metadata = lstatSync(path);
		if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > CONFIG_LIMIT) {
			return toolResult(publicDiagnostic("CONFIG_UNAVAILABLE"), true);
		}
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
			return toolResult(publicDiagnostic("CONFIG_CORRUPT"), true);
		}
		const connections = {};
		for (const [name, connection] of Object.entries(parsed)) {
			if (!connection || typeof connection !== "object" || Array.isArray(connection)) continue;
			if ((connection.db_type ?? connection.dbType) !== "sqlite") continue;
			connections[name] = redactValue(connection);
		}
		return toolResult(JSON.stringify({ connections }, null, 2));
	} catch {
		return toolResult(publicDiagnostic("CONFIG_CORRUPT"), true);
	}
}

function validQueryArguments(args) {
	if (!args || Array.isArray(args) || typeof args !== "object") return false;
	const keys = Object.keys(args);
	return keys.every((key) => key === "databasePath" || key === "query" || key === "format");
}

function queryDatabase(args) {
	if (!validQueryArguments(args)) return toolResult(publicDiagnostic("QUERY_REJECTED"), true);
	try {
		const result = executeReadOnlyQuery(args);
		return toolResult(result.text);
	} catch (error) {
		const code = error instanceof DatabaseBoundaryError ? error.code : "DATABASE_INTERNAL_ERROR";
		const status = error instanceof DatabaseBoundaryError ? error.status : "failed";
		return toolResult(publicDiagnostic(code, status), true);
	}
}

function handleToolCall(id, params) {
	if (!params || typeof params !== "object" || typeof params.name !== "string") {
		return sendError(id, -32602, "Invalid params");
	}
	if (params.name === "db_list_connections") return sendResponse(id, listConnections());
	if (params.name === "db_query") return sendResponse(id, queryDatabase(params.arguments ?? {}));
	return sendError(id, -32601, "Tool not found");
}

export function handleMessage(message) {
	if (!message || Array.isArray(message) || typeof message !== "object" || typeof message.method !== "string") {
		return sendError(null, -32600, "Invalid Request");
	}
	if (message.method === "notifications/initialized") return undefined;
	if (message.jsonrpc !== "2.0" || !validRequestId(message.id)) {
		return sendError(null, -32600, "Invalid Request");
	}
	if (message.method === "initialize") {
		const requestedVersion = message.params?.protocolVersion;
		if (!SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)) {
			return sendError(message.id, -32602, "Unsupported protocolVersion");
		}
		return sendResponse(message.id, {
			protocolVersion: requestedVersion,
			capabilities: { tools: {} },
			serverInfo: { name: "lazyantigravity-sqlite-readonly", version: "0.2.2" },
		});
	}
	if (message.method === "tools/list") return sendResponse(message.id, { tools: DATABASE_TOOLS });
	if (message.method === "tools/call") return handleToolCall(message.id, message.params);
	return sendError(message.id ?? null, -32601, "Method not found");
}

export function startServer() {
	let buffer = "";
	stdin.setEncoding("utf8");
	stdin.on("data", (chunk) => {
		buffer += chunk;
		if (Buffer.byteLength(buffer) > INPUT_LIMIT) {
			buffer = "";
			sendError(null, -32600, "Input limit exceeded");
			return;
		}
		for (;;) {
			const newline = buffer.indexOf("\n");
			if (newline < 0) break;
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (!line) continue;
			try {
				handleMessage(JSON.parse(line));
			} catch {
				sendError(null, -32700, "Parse error");
			}
		}
	});
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) startServer();
