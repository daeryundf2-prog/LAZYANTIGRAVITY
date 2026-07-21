import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	MAX_TRANSCRIPT_BYTES,
	runBoundedNodeProcess,
	runMcpLifecycle,
	terminateOwnedProcess,
	validateHookOutput,
} from "../scripts/staged-distribution/processes.mjs";

const root = join(import.meta.dirname, "..");

test("[todo15.process.hook] malformed or noisy hook output is rejected and transcripts are bounded", () => {
	assert.ok(MAX_TRANSCRIPT_BYTES > 0 && MAX_TRANSCRIPT_BYTES <= 65_536);
	assert.deepEqual(validateHookOutput("PreInvocation", "{}\n"), {});
	assert.deepEqual(validateHookOutput("Stop", "{\"decision\":\"stop\"}\n"), { decision: "stop" });
	assert.throws(() => validateHookOutput("PreInvocation", "not-json\n"), /hook.*json/i);
	assert.throws(() => validateHookOutput("PreInvocation", "{}\n{}\n"), /exactly one/i);
	assert.throws(() => validateHookOutput("Stop", "{\"decision\":\"continue\",\"reason\":\"injected\"}\n"), /shape/i);
});

test("[todo15.process.preflight] invalid stdin is rejected before a child can start", async () => {
	const testRoot = mkdtempSync(join(tmpdir(), "todo15 preflight stdin "));
	const marker = join(testRoot, "spawned.txt");
	let spawnCalls = 0;
	try {
		await assert.rejects(runBoundedNodeProcess({
			nodePath: process.execPath,
			argv: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'spawned')", marker],
			cwd: root,
			stdin: Object.freeze({ invalid: true }),
		}, { spawnProcess: async () => { spawnCalls += 1; return {}; } }), /stdin must be a string or Buffer/);
		assert.equal(spawnCalls, 0, "invalid stdin reached child_process.spawn");
		assert.equal(existsSync(marker), false, "invalid stdin reached child_process.spawn");
	} finally {
		rmSync(testRoot, { recursive: true, force: true });
	}
});

test("[todo15.process.preflight] malformed MCP safeCall is rejected before a server can start", async () => {
	const testRoot = mkdtempSync(join(tmpdir(), "todo15 preflight mcp "));
	const marker = join(testRoot, "spawned.txt");
	let spawnCalls = 0;
	try {
		await assert.rejects(runMcpLifecycle({
			nodePath: process.execPath,
			serverPath: marker,
			cwd: root,
			safeCall: Object.freeze({ name: 1 }),
			requestTimeoutMs: 50,
		}, { spawnProcess: async () => { spawnCalls += 1; throw new Error("spawn called"); } }),
		/safeCall must contain a tool name and plain-object arguments/);
		assert.equal(spawnCalls, 0, "malformed MCP options reached child_process.spawn");
		assert.equal(existsSync(marker), false, "malformed MCP options reached child_process.spawn");
	} finally {
		rmSync(testRoot, { recursive: true, force: true });
	}
});

test("[todo15.process.pid-reuse] creation-time mismatch performs zero termination calls", () => {
	const expected = Object.freeze({
		pid: 4242,
		parent: process.pid,
		created: "2026-07-13T00:00:00.000Z",
		exe: process.execPath,
		commandLine: `"${process.execPath}" server.mjs`,
	});
	const actual = Object.freeze({ ...expected, created: "2026-07-13T00:00:01.000Z" });
	let processKillCalls = 0;
	let taskkillCalls = 0;
	const handle = {
		child: { pid: expected.pid, exitCode: null },
		nodePath: process.execPath,
		spawnedPid: expected.pid,
		spawnedIdentity: expected,
	};
	assert.throws(() => terminateOwnedProcess(handle, "SIGTERM", {
		platform: "win32",
		processKill: () => { processKillCalls += 1; },
		readIdentity: () => actual,
		taskkill: () => { taskkillCalls += 1; return { error: null, status: 0 }; },
	}), /refusing to terminate an unverified process tree/);
	assert.equal(processKillCalls, 0);
	assert.equal(taskkillCalls, 0);
});
