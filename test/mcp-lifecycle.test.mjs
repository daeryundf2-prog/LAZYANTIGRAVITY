import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const testDaemonRoot = join(root, ".omo", "evidence", "task-11-lsp-daemon-test");
const minimumNode = { major: 20, minor: 17, patch: 0 };

function parseNodeVersion(output) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(output.trim());
	if (!match) return { status: "unavailable", reason: "node-version-unparseable", raw: output };
	const version = { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
	const ok =
		version.major > minimumNode.major ||
		(version.major === minimumNode.major && version.minor > minimumNode.minor) ||
		(version.major === minimumNode.major && version.minor === minimumNode.minor && version.patch >= minimumNode.patch);
	return ok ? { status: "available", version } : { status: "unavailable", reason: "node-too-old", version };
}

function preflightPathNode() {
	const result = spawnSync("node", ["--version"], { encoding: "utf8" });
	if (result.error) return { status: "unavailable", reason: "node-not-found", error: result.error.message };
	if (result.status !== 0) return { status: "unavailable", reason: "node-version-command-failed", stderr: result.stderr };
	return parseNodeVersion(result.stdout);
}

function worktreeMcpProcessIds() {
	if (process.platform !== "win32") return [];
	const escapedRoot = root.replaceAll("'", "''");
	const escapedDaemonRoot = testDaemonRoot.replaceAll("'", "''");
	const command = `$root = '${escapedRoot}'; $needles = @('components/git-bash-mcp/dist/cli.js','components/git-bash-mcp\\\\dist\\\\cli.js','components/lsp-daemon/dist/cli.js','components/lsp-daemon\\\\dist\\\\cli.js','scripts/database-mcp.mjs'); Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $cmd = $_.CommandLine; $cmd -and $cmd.Contains($root) -and ($needles | Where-Object { $cmd.Contains($_) }) } | Select-Object -ExpandProperty ProcessId`;
	const result = spawnSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`Failed to scan worktree MCP node processes: ${result.stderr}`);
	}
	return result.stdout
		.split(/\r?\n/)
		.map((line) => Number(line.trim()))
		.filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

async function testDaemonPidFiles() {
	try {
		const dirs = await readdir(testDaemonRoot, { recursive: true, withFileTypes: true });
		return dirs
			.filter((entry) => entry.isFile() && entry.name === "daemon.pid")
			.map((entry) => join(entry.parentPath, entry.name));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
		throw error;
	}
}

function cleanupTestDaemonPidFiles() {
	const pidFiles = [];
	try {
		const stack = [testDaemonRoot];
		while (stack.length > 0) {
			const current = stack.pop();
			for (const entry of readdirSync(current, { withFileTypes: true })) {
				const full = join(current, entry.name);
				if (entry.isDirectory()) stack.push(full);
				if (entry.isFile() && entry.name === "daemon.pid") pidFiles.push(full);
			}
		}
	} catch (error) {
		if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
	}
	const pids = pidFiles
		.map((pidFile) => Number(readFileSync(pidFile, "utf8").trim()))
		.filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
	if (pids.length > 0) {
		const result = spawnSync("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${pids.join(",")} -Force -ErrorAction SilentlyContinue`], {
			encoding: "utf8",
		});
		if (result.status !== 0) throw new Error(`Failed to cleanup test LSP daemon pids: ${result.stderr}`);
	}
	rmSync(testDaemonRoot, { recursive: true, force: true });
	return pids;
}

function cleanupWorktreeMcpProcesses() {
	const daemonPids = cleanupTestDaemonPidFiles();
	const pids = worktreeMcpProcessIds();
	if (pids.length === 0) return daemonPids;
	const result = spawnSync("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${pids.join(",")} -Force -ErrorAction SilentlyContinue`], {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(`Failed to cleanup worktree MCP node processes: ${result.stderr}`);
	}
	return [...daemonPids, ...pids];
}

async function exists(relativePath) {
	try {
		await stat(join(root, relativePath));
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

function lineReader(stream) {
	let buffer = "";
	const lines = [];
	const waiters = [];
	stream.setEncoding("utf8");
	stream.on("data", (chunk) => {
		buffer += chunk;
		let newlineIndex = buffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
			buffer = buffer.slice(newlineIndex + 1);
			if (line.length > 0) lines.push(line);
			newlineIndex = buffer.indexOf("\n");
		}
		while (waiters.length > 0 && lines.length > 0) {
			const waiter = waiters.shift();
			waiter.resolve(lines.shift());
		}
	});
	return {
		async next(timeoutMs = 1000) {
			if (lines.length > 0) return lines.shift();
			return await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					const index = waiters.findIndex((waiter) => waiter.resolve === resolve);
					if (index !== -1) waiters.splice(index, 1);
					reject(new Error(`Timed out waiting for stdout JSON-RPC line after ${timeoutMs}ms`));
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

async function waitForExit(child, timeoutMs) {
	if (child.exitCode !== null || child.signalCode !== null) return { exited: true, exitCode: child.exitCode, signalCode: child.signalCode };
	return await Promise.race([
		new Promise((resolve) => {
			child.once("exit", (exitCode, signalCode) => resolve({ exited: true, exitCode, signalCode }));
		}),
		delay(timeoutMs).then(() => ({ exited: false })),
	]);
}

async function closeByTransport(child) {
	child.stdin.end();
	let exit = await waitForExit(child, 2000);
	if (exit.exited) return { method: "stdin-close", ...exit };

	child.kill("SIGTERM");
	exit = await waitForExit(child, 500);
	if (exit.exited) return { method: "sigterm-after-stdin-close", ...exit };

	child.kill("SIGKILL");
	exit = await waitForExit(child, 500);
	return { method: "sigkill-after-stdin-close-and-sigterm", ...exit };
}

async function transact(reader, child, message, timeoutMs = 5000) {
	child.stdin.write(`${JSON.stringify(message)}\n`);
	const line = await reader.next(timeoutMs);
	assert.doesNotMatch(line, /^Content-Length:/, "stdio response must be newline-delimited JSON-RPC, not framed headers");
	const parsed = JSON.parse(line);
	assert.equal(parsed.jsonrpc, "2.0");
	assert.equal(parsed.id, message.id);
	return parsed;
}

async function runLifecycle({ serverId, args, toolName }) {
	mkdirSync(testDaemonRoot, { recursive: true });
	const child = spawn("node", args, {
		cwd: root,
		stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, CODEX_LSP_DAEMON_DIR: testDaemonRoot },
	});
	let stderr = "";
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	const reader = lineReader(child.stdout);
	let cleanup = null;
	try {
		const init = await transact(reader, child, {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "lazyantigravity-todo11-test", version: "0.0.0" },
			},
		});
		assert.equal(init.error, undefined, `${serverId} initialize failed: ${stderr}`);

		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
		await delay(100);
		assert.equal(reader.pendingCount(), 0, `${serverId} initialized notification must be silent`);

		const tools = await transact(reader, child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
		assert.equal(tools.error, undefined, `${serverId} tools/list failed: ${stderr}`);
		assert.ok(Array.isArray(tools.result.tools), `${serverId} tools/list must return tools array`);

		let call = null;
		if (toolName) {
			call = await transact(reader, child, {
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: toolName, arguments: {} },
			});
			assert.equal(call.error, undefined, `${serverId}.${toolName} must return a typed result, including unavailable status when dependencies are missing`);
		}

		cleanup = await closeByTransport(child);
		assert.equal(cleanup.exited, true, `${serverId} must not leave an orphan process`);
		return { init, tools, call, cleanup };
	} finally {
		if (!cleanup && child.exitCode === null && child.signalCode === null) {
			await closeByTransport(child);
		}
	}
}

test("#given PATH node preflight #when Node 16 is detected #then it is typed unavailable", () => {
	assert.deepEqual(parseNodeVersion("v16.15.0"), {
		status: "unavailable",
		reason: "node-too-old",
		version: { major: 16, minor: 15, patch: 0 },
	});
});

test("#given local stdio MCP servers #when lifecycle exercised #then stdio shutdown and safe calls are protocol-clean", async (t) => {
	const node = preflightPathNode();
	if (node.status !== "available") {
		t.skip(`PATH node unavailable for runtime lifecycle: ${JSON.stringify(node)}`);
		return;
	}

	cleanupWorktreeMcpProcesses();
	try {
		await runLifecycle({ serverId: "git-bash", args: ["./components/git-bash-mcp/dist/cli.js", "mcp"], toolName: "which_bash" });
		await runLifecycle({ serverId: "lsp", args: ["./components/lsp-daemon/dist/cli.js", "mcp"], toolName: "status" });

		if (await exists("scripts/database-mcp.mjs")) {
			await runLifecycle({ serverId: "database", args: ["./scripts/database-mcp.mjs"] });
		}
	} finally {
		cleanupWorktreeMcpProcesses();
	}
	assert.deepEqual(await testDaemonPidFiles(), [], "manual lifecycle must remove test-owned LSP daemon pid files");
	assert.deepEqual(worktreeMcpProcessIds(), [], "manual lifecycle must leave no worktree-local MCP node orphan");
});
