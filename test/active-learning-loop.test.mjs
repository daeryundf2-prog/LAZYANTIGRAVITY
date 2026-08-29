import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, "components", "active-learning", "dist", "cli.js");
const HOOK_RUNNER = join(ROOT, "scripts", "hook-runner.mjs");

function runCli(args, cwd) {
	return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 15000 });
}

test("recorded failures cluster into a promotable gotcha", () => {
	const dir = mkdtempSync(join(tmpdir(), "al-loop-"));
	try {
		for (let i = 0; i < 3; i++) {
			const res = runCli(["record", "--tool", "git_bash_execute", "--error", "fatal: not a git repository"], dir);
			assert.equal(res.status, 0, res.stderr);
		}
		const analyze = runCli(["analyze"], dir);
		assert.equal(analyze.status, 0);
		assert.match(analyze.stdout, /Total Failure Events Scanned: 3/);
		assert.match(analyze.stdout, /Significant Error Clusters: 1/);
		assert.match(analyze.stdout, /git_bash_execute/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ulw-loop ledger failures feed the analyzer without a runtime dependency", () => {
	const dir = mkdtempSync(join(tmpdir(), "al-ledger-"));
	try {
		const runDir = join(dir, ".omo", "ulw-loop", "runs", "run-1");
		mkdirSync(runDir, { recursive: true });
		const ledger = [
			{ timestamp: Date.now(), type: "quality_gate.started", runId: "run-1" },
			{ timestamp: Date.now(), type: "quality_gate.failed", runId: "run-1", reason: "Mechanical check failed" },
			{ timestamp: Date.now(), type: "quality_gate.failed", runId: "run-1", reason: "Mechanical check failed" },
		].map((e) => JSON.stringify(e)).join("\n") + "\n";
		writeFileSync(join(runDir, "events.jsonl"), ledger, "utf8");

		const analyze = runCli(["analyze"], dir);
		assert.equal(analyze.status, 0);
		assert.match(analyze.stdout, /ulw-loop/);
		assert.match(analyze.stdout, /Mechanical check failed/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("hook-runner records hook failures while still failing open", { skip: process.platform === "win32" && "fake npm PATH trick is unix-only" }, () => {
	const dir = mkdtempSync(join(tmpdir(), "al-hook-"));
	try {
		const failingHook = join(dir, "failing-hook.mjs");
		writeFileSync(failingHook, 'process.stderr.write("boom from hook"); process.exit(3);\n', "utf8");
		// Clusters form at two or more occurrences of the same signature.
		for (let i = 0; i < 2; i++) {
			const res = spawnSync(process.execPath, [HOOK_RUNNER, "FAIL_OPEN", "none", "none", process.execPath, failingHook], {
				cwd: dir,
				encoding: "utf8",
				timeout: 15000,
			});
			assert.equal(res.status, 0, "FAIL_OPEN must swallow the failure");
		}

		const analyze = runCli(["analyze"], dir);
		assert.equal(analyze.status, 0);
		assert.match(analyze.stdout, /hook:failing-hook\.mjs/);
		assert.match(analyze.stdout, /boom from hook/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
