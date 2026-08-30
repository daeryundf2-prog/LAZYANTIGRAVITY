import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(ROOT, "scripts", "update-check.mjs");

function runCheck(repoRoot) {
	return spawnSync(process.execPath, [SCRIPT], {
		encoding: "utf8",
		timeout: 30000,
		env: { ...process.env, UPDATE_CHECK_REPO_ROOT: repoRoot },
	});
}

function git(repo, ...args) {
	const res = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
	assert.equal(res.status, 0, res.stderr);
	return res.stdout.trim();
}

test("update check stays silent when HEAD matches origin/main", () => {
	const dir = mkdtempSync(join(tmpdir(), "upd-ok-"));
	try {
		const origin = join(dir, "origin");
		const work = join(dir, "work");
		mkdirSync(origin); mkdirSync(work);
		git(origin, "init", "-q", "-b", "main");
		writeFileSync(join(origin, "f.txt"), "1");
		git(origin, "add", "."); git(origin, "config", "user.email", "t@t"); git(origin, "config", "user.name", "t");
		git(origin, "commit", "-qm", "c1");
		git(work, "clone", "-q", origin, ".");
		const res = runCheck(work);
		assert.equal(res.status, 0);
		assert.equal(res.stdout.trim(), "", "up-to-date installs must stay silent");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("update check reports commits behind origin/main", () => {
	const dir = mkdtempSync(join(tmpdir(), "upd-behind-"));
	try {
		const origin = join(dir, "origin");
		const work = join(dir, "work");
		mkdirSync(origin); mkdirSync(work);
		git(origin, "init", "-q", "-b", "main");
		writeFileSync(join(origin, "f.txt"), "1");
		git(origin, "add", "."); git(origin, "config", "user.email", "t@t"); git(origin, "config", "user.name", "t");
		git(origin, "commit", "-qm", "c1");
		git(work, "clone", "-q", origin, ".");
		writeFileSync(join(origin, "f.txt"), "2");
		git(origin, "commit", "-qam", "c2");
		const res = runCheck(work);
		assert.equal(res.status, 0);
		const output = JSON.parse(res.stdout);
		const ctx = output.hookSpecificOutput.additionalContext;
		assert.match(ctx, /1 commit\(s\) behind/);
		assert.match(ctx, /git -C .*pull/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("update check reports divergence and stays silent when disabled", () => {
	const dir = mkdtempSync(join(tmpdir(), "upd-div-"));
	try {
		const origin = join(dir, "origin");
		const work = join(dir, "work");
		mkdirSync(origin); mkdirSync(work);
		git(origin, "init", "-q", "-b", "main");
		writeFileSync(join(origin, "f.txt"), "1");
		git(origin, "add", "."); git(origin, "config", "user.email", "t@t"); git(origin, "config", "user.name", "t");
		git(origin, "commit", "-qm", "c1");
		git(work, "clone", "-q", origin, ".");
		writeFileSync(join(work, "local.txt"), "local");
		git(work, "add", "."); git(work, "commit", "-qm", "local");
		writeFileSync(join(origin, "f.txt"), "2");
		git(origin, "commit", "-qam", "c2");
		const diverged = runCheck(work);
		assert.match(diverged.stdout, /diverged/);
		// kill switch
		const disabled = spawnSync(process.execPath, [SCRIPT], {
			encoding: "utf8",
			timeout: 30000,
			env: { ...process.env, UPDATE_CHECK_REPO_ROOT: work, LAZYANTIGRAVITY_UPDATE_CHECK: "0" },
		});
		assert.equal(disabled.stdout.trim(), "");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
