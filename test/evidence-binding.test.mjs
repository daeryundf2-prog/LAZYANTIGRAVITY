import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { classifyLedger, fingerprint } from "../scripts/lib/evidence-binding.mjs";
import { root } from "./aggregate-plugin-fixture.mjs";

const script = join(root, "scripts", "lazyantigravity-evidence-map.mjs");

function git(cwd, ...args) {
	const res = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" });
	assert.equal(res.status, 0, res.stderr);
}

function makeRepo() {
	const dir = mkdtempSync(join(tmpdir(), "lag-evidence-binding-"));
	git(dir, "init", "-q");
	writeFileSync(join(dir, "app.txt"), "one\n");
	git(dir, "add", ".");
	git(dir, "commit", "-q", "-m", "init");
	return dir;
}

function cli(dir, ...args) {
	return spawnSync("node", [script, "--repo", dir, ...args], { encoding: "utf8" });
}

function record(dir, criterion, verdict = "pass", ...extra) {
	const res = cli(dir, "--record", ".omo/ledger.jsonl", "--criterion", criterion, "--verdict", verdict, "--command", "npm test", "--evidence", "exit 0", ...extra);
	assert.equal(res.status, 0, res.stderr);
}

const state = (dir, ...extra) => {
	const res = cli(dir, "--check-ledger", ".omo/ledger.jsonl", ...extra);
	return { status: res.status, report: JSON.parse(res.stdout) };
};

test("#given a recorded pass #when the worktree is unchanged and the ledger grows #then the proof stays fresh", () => {
	const dir = makeRepo();
	try {
		record(dir, "C1");
		record(dir, "C2");
		const { status, report } = state(dir);
		assert.equal(status, 0);
		assert.deepEqual(report.results.map((r) => r.state), ["pass", "pass"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("#given a recorded pass #when a tracked file or a new file changes #then the proof is stale and exits 1", () => {
	const dir = makeRepo();
	try {
		record(dir, "C1");
		writeFileSync(join(dir, "app.txt"), "two\n");
		let result = state(dir);
		assert.equal(result.status, 1);
		assert.equal(result.report.results[0].state, "stale");

		writeFileSync(join(dir, "app.txt"), "one\n");
		assert.equal(state(dir).report.results[0].state, "pass");

		writeFileSync(join(dir, "new.txt"), "untracked\n");
		result = state(dir);
		assert.equal(result.report.results[0].state, "stale");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("#given a stale proof #when the criterion is re-recorded #then the newest row wins", () => {
	const dir = makeRepo();
	try {
		record(dir, "C1");
		writeFileSync(join(dir, "app.txt"), "two\n");
		record(dir, "C1");
		assert.equal(state(dir).report.results[0].state, "pass");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("#given failing, blocked, unlisted, and artifact-less rows #when checked #then none counts as pass", () => {
	const dir = makeRepo();
	try {
		record(dir, "C1", "fail");
		record(dir, "C2", "blocked");
		record(dir, "C3", "pass", "--artifact", "evidence/c3.txt");
		const { status, report } = state(dir, "--criteria", "C1,C2,C3,C4");
		assert.equal(status, 1);
		const byId = Object.fromEntries(report.results.map((r) => [r.criterion_id, r.state]));
		assert.deepEqual(byId, { C1: "failing", C2: "failing", C3: "missing-evidence-file", C4: "missing" });

		mkdirSync(join(dir, "evidence"));
		writeFileSync(join(dir, "evidence", "c3.txt"), "ok\n");
		// the new artifact is itself an untracked file, so the recorded fingerprint is stale until re-recorded
		assert.equal(state(dir, "--criteria", "C3").report.results[0].state, "stale");
		record(dir, "C3", "pass", "--artifact", "evidence/c3.txt");
		assert.equal(state(dir, "--criteria", "C3").report.results[0].state, "pass");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("#given a repo with no commits #when fingerprinted #then tree is none and rows classify without throwing", () => {
	const dir = mkdtempSync(join(tmpdir(), "lag-evidence-binding-empty-"));
	try {
		git(dir, "init", "-q");
		const current = fingerprint(dir);
		assert.equal(current.tree, "none");
		assert.equal(classifyLedger([], current, { criteria: ["C1"], cwd: dir }).results[0].state, "missing");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("#given a malformed ledger line #when checked #then the command exits nonzero with the line number", () => {
	const dir = makeRepo();
	try {
		mkdirSync(join(dir, ".omo"));
		writeFileSync(join(dir, ".omo", "ledger.jsonl"), "{not json}\n");
		const res = cli(dir, "--check-ledger", ".omo/ledger.jsonl");
		assert.notEqual(res.status, 0);
		assert.match(res.stderr, /line 1/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
