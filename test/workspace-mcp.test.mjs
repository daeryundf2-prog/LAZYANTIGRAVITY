import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = join(ROOT, "workspace-mcp", "dist", "cli.js");
const DAEMON_CLI = join(ROOT, "components", "daemon-bridge", "dist", "cli.js");

function callTool(name, args, cwd, env = {}) {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		encoding: "utf8",
		timeout: 15000,
		cwd,
		env: { ...process.env, ...env },
	});
	assert.equal(res.status, 0, res.stderr);
	const output = JSON.parse(res.stdout);
	assert.ok(output.result, JSON.stringify(output));
	return JSON.parse(output.result.content[0].text);
}

function initGitRepo(dir) {
	spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8" });
	spawnSync("git", ["config", "user.name", "TestUser"], { cwd: dir, encoding: "utf8" });
	spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, encoding: "utf8" });
	writeFileSync(join(dir, "init.txt"), "hello", "utf8");
	spawnSync("git", ["add", "."], { cwd: dir, encoding: "utf8" });
	spawnSync("git", ["commit", "-qm", "initial"], { cwd: dir, encoding: "utf8" });
}

function withWorkspace(name, fn) {
	const dir = mkdtempSync(join(tmpdir(), `${name}-`));
	try {
		fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("workspace-mcp exposes the seven workspace tools", () => {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
		encoding: "utf8",
		timeout: 10000,
	});
	assert.equal(res.status, 0);
	const tools = JSON.parse(res.stdout).result.tools.map((t) => t.name);
	assert.deepEqual(tools, [
		"memory_search",
		"blackboard_set",
		"blackboard_get",
		"blackboard_list",
		"session_tree_snapshot",
		"session_tree_fork",
		"session_tree_render",
	]);
});

test("memory_search works on an empty workspace", () => {
	withWorkspace("wm-empty", (dir) => {
		const res = callTool("memory_search", { query: "anything" }, dir);
		assert.equal(res.ok, true);
		assert.equal(res.totalFacts, 0);
	});
});

test("blackboard tools fail honestly when the daemon is not running", () => {
	withWorkspace("wm-nodaemon", (dir) => {
		const res = callTool("blackboard_set", { key: "k", value: "v" }, dir);
		assert.equal(res.ok, false);
		assert.match(res.error, /daemon is not running/);
	});
});

test("blackboard round-trips through a live daemon", { skip: process.platform === "win32" }, () => {
	withWorkspace("wmd-", (dir) => {
		const daemonLog = join(dir, "daemon.log");
		const logFd = openSync(daemonLog, "w");
		const daemon = spawn(process.execPath, [DAEMON_CLI, "daemon", "start", "--foreground"], {
			cwd: dir,
			detached: true,
			stdio: ["ignore", logFd, logFd],
		});
		daemon.unref();
		try {
			const socketPath = join(dir, ".lazyantigravity", "run", "daemon.sock");
			const deadline = Date.now() + 5000;
			while (!existsSync(socketPath) && Date.now() < deadline) {
				spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 50)"]);
			}
			if (!existsSync(socketPath)) {
				let log = "";
				try { log = readFileSync(daemonLog, "utf8"); } catch {}
				assert.fail(`daemon socket must appear; log: ${log || "<empty>"}`);
			}

			const set = callTool("blackboard_set", { key: "worker/status", value: { state: "running" }, namespace: "swarm" }, dir);
			assert.equal(set.ok, true);
			const get = callTool("blackboard_get", { key: "worker/status" }, dir);
			assert.deepEqual(get.value, { state: "running" });
			const list = callTool("blackboard_list", { namespace: "swarm" }, dir);
			assert.equal(list.total, 1);

			const stop = spawnSync(process.execPath, [DAEMON_CLI, "daemon", "stop"], { cwd: dir, encoding: "utf8" });
			assert.equal(stop.status, 0);
		} finally {
			try {
				process.kill(-daemon.pid, "SIGTERM");
			} catch {}
		}
	});
});

test("session_tree tools snapshot and gate fork behind the env opt-in", () => {
	withWorkspace("wm-tree", (dir) => {
		initGitRepo(dir);
		const snap = callTool("session_tree_snapshot", { label: "MCP baseline" }, dir);
		assert.equal(snap.ok, true);
		assert.ok(snap.node.id);

		const render = callTool("session_tree_render", {}, dir);
		assert.equal(render.ok, true);
		assert.ok(render.tree.includes("MCP baseline"));

		const denied = callTool("session_tree_fork", { nodeId: snap.node.id }, dir);
		assert.equal(denied.ok, false);
		assert.match(denied.error, /LAZYANTIGRAVITY_SESSION_TREE_FORK=1/);

		// A fork back to the active node itself is a no-op restore; the gate,
		// not the payload, is what this asserts.
		const allowed = callTool("session_tree_fork", { nodeId: snap.node.id }, dir, { LAZYANTIGRAVITY_SESSION_TREE_FORK: "1" });
		assert.equal(allowed.ok, true);
	});
});
