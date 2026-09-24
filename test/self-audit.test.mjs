import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const selfAuditScript = join(root, "scripts", "self-audit.mjs");

test("#given self-audit script #when executed with --json #then returns valid JSON report", () => {
	// when
	const output = execSync(`node "${selfAuditScript}" --json`, {
		cwd: root,
		encoding: "utf8",
	});
	const report = JSON.parse(output.trim());

	// then
	assert.ok(report.branch);
	assert.ok(Array.isArray(report.changed_files));
	assert.ok(Array.isArray(report.recent_commits));
	assert.ok(typeof report.changed_files_count === "number");
});

test("#given uncommitted mistake in repo #when self-audit --rollback is triggered #then cleanly discards useless mistake", () => {
	// given: an isolated git repository with a committed baseline
	const tempDir = mkdtempSync(join(tmpdir(), "self-audit-test-"));
	try {
		execSync("git init -b main", { cwd: tempDir, encoding: "utf8" });
		execSync("git config core.autocrlf false", { cwd: tempDir, encoding: "utf8" });
		execSync('git config user.name "Test Runner"', { cwd: tempDir, encoding: "utf8" });
		execSync('git config user.email "test@example.com"', { cwd: tempDir, encoding: "utf8" });

		const baselineFile = join(tempDir, "baseline.txt");
		writeFileSync(baselineFile, "baseline clean content\n", "utf8");
		execSync('git add baseline.txt && git commit -m "Initial commit"', { cwd: tempDir, encoding: "utf8" });

		// inject an uncommitted mistake into baseline file
		writeFileSync(baselineFile, "baseline clean content\n[INJECTED_USELESS_MISTAKE]\n", "utf8");

		// verify git detects dirty state
		const dirtyStatus = execSync("git status --short", { cwd: tempDir, encoding: "utf8" });
		assert.match(dirtyStatus, /baseline\.txt/);

		// when: execute self-audit rollback targeted at this repository
		const rollbackOutput = execSync(`node "${selfAuditScript}" --rollback`, {
			cwd: tempDir,
			env: { ...process.env, OMO_REPO_ROOT: tempDir },
			encoding: "utf8",
		});

		// then: the useless mistake is discarded and clean state restored
		assert.match(rollbackOutput, /Restored all uncommitted modified working files/);
		const restoredContent = readFileSync(baselineFile, "utf8");
		assert.equal(restoredContent, "baseline clean content\n");
		const cleanStatus = execSync("git status --short", { cwd: tempDir, encoding: "utf8" }).trim();
		assert.equal(cleanStatus, "");
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
