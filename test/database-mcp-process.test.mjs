import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverPath = join(root, "scripts", "database-mcp.mjs");
const supportedProtocols = ["2025-06-18", "2024-11-05"];

function lineReader(stream) {
	let buffer = "";
	const lines = [];
	const waiters = [];
	stream.setEncoding("utf8");
	stream.on("data", (chunk) => {
		buffer += chunk;
		for (;;) {
			const newline = buffer.indexOf("\n");
			if (newline === -1) break;
			const line = buffer.slice(0, newline).replace(/\r$/, "");
			buffer = buffer.slice(newline + 1);
			if (line) lines.push(line);
		}
		while (waiters.length > 0 && lines.length > 0) waiters.shift().resolve(lines.shift());
	});
	return {
		async next(timeoutMs = 1000) {
			if (lines.length > 0) return lines.shift();
			return await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					const index = waiters.findIndex((waiter) => waiter.resolve === resolve);
					if (index !== -1) waiters.splice(index, 1);
					reject(new Error(`Timed out waiting for newline JSON after ${timeoutMs}ms`));
				}, timeoutMs);
				waiters.push({
					resolve: (line) => {
						clearTimeout(timeout);
						resolve(line);
					},
				});
			});
		},
		pendingCount() {
			return lines.length;
		},
	};
}

function startServer(extraEnv = {}) {
	const child = spawn(process.execPath, [serverPath], {
		cwd: root,
		stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, ...extraEnv },
		windowsHide: true,
	});
	let stderr = "";
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	return { child, reader: lineReader(child.stdout), stderr: () => stderr };
}

async function waitForExit(child, timeoutMs) {
	if (child.exitCode !== null || child.signalCode !== null) return { exited: true, exitCode: child.exitCode, signalCode: child.signalCode };
	return await Promise.race([
		new Promise((resolve) => child.once("exit", (exitCode, signalCode) => resolve({ exited: true, exitCode, signalCode }))),
		delay(timeoutMs).then(() => ({ exited: false })),
	]);
}

async function closeByTransport(child) {
	child.stdin.end();
	let exit = await waitForExit(child, 2000);
	if (exit.exited) return { method: "stdin-close", ...exit };
	child.kill("SIGTERM");
	exit = await waitForExit(child, 500);
	if (exit.exited) return { method: "term-after-2s-stdin-close", ...exit };
	child.kill("SIGKILL");
	exit = await waitForExit(child, 500);
	return { method: "kill-after-term", ...exit };
}

async function request(session, message) {
	session.child.stdin.write(`${JSON.stringify(message)}\n`);
	const line = await session.reader.next();
	assert.doesNotMatch(line, /^Content-Length:/i, "database MCP stdout must be newline JSON, not header-framed output");
	const parsed = JSON.parse(line);
	assert.equal(parsed.jsonrpc, "2.0");
	if ("id" in message) assert.equal(parsed.id, message.id);
	return parsed;
}

function initializeMessage(protocolVersion, id = 1) {
	return {
		jsonrpc: "2.0",
		id,
		method: "initialize",
		params: {
			protocolVersion,
			capabilities: { roots: { listChanged: false }, sampling: {} },
			clientInfo: { name: "lazyantigravity-database-process-test", version: "0.0.0" },
		},
	};
}

for (const protocolVersion of supportedProtocols) {
	test(`[database.mcp.lifecycle.${protocolVersion}] initialize, initialized notification, tools/list, safe call, stdin close`, async () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-process-"));
		const configDir = join(tempRoot, "config");
		mkdirSync(configDir, { recursive: true });
		const session = startServer({ SQLIT_CONFIG_DIR: configDir });
		let cleanup = null;
		try {
			const init = await request(session, initializeMessage(protocolVersion));
			assert.equal(init.error, undefined, session.stderr());
			assert.equal(init.result.protocolVersion, protocolVersion);
			assert.deepEqual(init.result.capabilities, { tools: {} });
			assert.equal(init.result.serverInfo.name, "lazyantigravity-sqlite-readonly");

			session.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
			await delay(150);
			assert.equal(session.reader.pendingCount(), 0, "initialized notification must not produce a JSON-RPC response");

			const tools = await request(session, { jsonrpc: "2.0", id: 2, method: "tools/list" });
			assert.equal(tools.error, undefined, session.stderr());
			assert.deepEqual(tools.result.tools.map((tool) => tool.name).sort(), ["db_list_connections", "db_query"]);
			assert.doesNotMatch(JSON.stringify(tools.result.tools), /password|mutation|postgres|mysql|mssql|connectionUrl|"url"/i);
			assert.match(JSON.stringify(tools.result.tools), /SQLite|read-only|redacted/i);

			const safeCall = await request(session, {
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: "db_list_connections", arguments: {} },
			});
			assert.equal(safeCall.error, undefined, session.stderr());
			assert.equal(safeCall.result.isError, false);
			assert.deepEqual(JSON.parse(safeCall.result.content[0].text), { connections: {} });

			cleanup = await closeByTransport(session.child);
			assert.equal(cleanup.exited, true, "database MCP must not leave an orphan after transport close");
			assert.equal(cleanup.method, "stdin-close");
			assert.equal(session.stderr(), "");
		} finally {
			if (!cleanup && session.child.exitCode === null && session.child.signalCode === null) await closeByTransport(session.child);
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});
}

test("[database.mcp.lifecycle.unsupported-protocol] initialize version mismatch returns typed JSON-RPC error", async () => {
	const session = startServer();
	let cleanup = null;
	try {
		const response = await request(session, initializeMessage("1999-01-01"));
		assert.equal(response.result, undefined);
		assert.equal(response.error.code, -32602);
		assert.match(response.error.message, /Unsupported protocolVersion/);
		cleanup = await closeByTransport(session.child);
		assert.equal(cleanup.exited, true);
	} finally {
		if (!cleanup && session.child.exitCode === null && session.child.signalCode === null) await closeByTransport(session.child);
	}
});

test("[database.mcp.lifecycle.failure-probes] corrupt config and unsafe query failures are sanitized JSON-RPC tool results", async () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-db-process-fail-"));
	const configDir = join(tempRoot, "config");
	mkdirSync(configDir, { recursive: true });
	writeFileSync(join(configDir, "connections.json"), "{CORRUPT_SECRET_SENTINEL", { mode: 0o600 });
	const session = startServer({ SQLIT_CONFIG_DIR: configDir });
	let cleanup = null;
	try {
		await request(session, initializeMessage("2025-06-18"));
		const corrupt = await request(session, {
			jsonrpc: "2.0",
			id: 2,
			method: "tools/call",
			params: { name: "db_list_connections", arguments: {} },
		});
		assert.equal(corrupt.error, undefined);
		assert.equal(corrupt.result.isError, true);
		assert.match(corrupt.result.content[0].text, /CONFIG_CORRUPT/);
		assert.doesNotMatch(corrupt.result.content[0].text, /CORRUPT_SECRET_SENTINEL|connections\.json/);

		for (const [id, args, expected] of [
			[3, { databasePath: "fixture.db", query: "SELECT writefile('x','y')" }, "QUERY_REJECTED"],
			[4, { databasePath: "postgres://user:secret@example.invalid/db", query: "SELECT 1" }, "DATABASE_PATH_REJECTED"],
		]) {
			const response = await request(session, {
				jsonrpc: "2.0",
				id,
				method: "tools/call",
				params: { name: "db_query", arguments: args },
			});
			assert.equal(response.error, undefined);
			assert.equal(response.result.isError, true);
			assert.match(response.result.content[0].text, new RegExp(expected));
			assert.doesNotMatch(JSON.stringify(response), /secret@example|writefile\('x','y'\)/);
		}

		cleanup = await closeByTransport(session.child);
		assert.equal(cleanup.exited, true);
	} finally {
		if (!cleanup && session.child.exitCode === null && session.child.signalCode === null) await closeByTransport(session.child);
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("[database.mcp.lifecycle.abrupt-close] stdin close before initialize exits without TERM/KILL", async () => {
	const session = startServer();
	const cleanup = await closeByTransport(session.child);
	assert.equal(cleanup.exited, true);
	assert.equal(cleanup.method, "stdin-close");
	assert.equal(session.stderr(), "");
});
