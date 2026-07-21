import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const validator = join(root, "scripts", "validate-antigravity-distribution.mjs");

// Pinned pre-Todo15 baseline: the validator returned only
// {status:"passed",manifests:["distribution-files","test-files","change-scope"]}.
test("[todo15.integration] staged validator proves the exact portable distribution and durable bundle", () => {
	const temp = mkdtempSync(join(tmpdir(), "todo15 integrated contract with spaces "));
	const artifactRoot = join(temp, "durable artifact bundle");
	const receipt = join(temp, "validator receipt.json");
	try {
		const result = spawnSync(process.execPath, [validator,
			"--subject-root", root,
			"--artifact-root", artifactRoot,
			"--receipt", receipt,
		], { cwd: temp, encoding: "utf8", timeout: 120_000, windowsHide: true });
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.equal(result.stderr, "");
		assert.equal(result.stdout.trimEnd().split(/\r?\n/).length, 1);
		const report = JSON.parse(result.stdout);
		assert.equal(report.status, "passed");
		assert.equal(report.layouts.length, 4);
		assert.equal(new Set(report.layouts.map(({ layoutHash }) => layoutHash)).size, 1);
		assert.deepEqual(report.layouts.map(({ id }) => id), [
			"ide-dot-workspace", "ide-underscore-workspace", "ide-global", "cli-global",
		]);
		assert.deepEqual(report.layouts.map(({ ruleStatus }) => ruleStatus), [
			"unverified", "unverified", "unverified", "not-applicable",
		]);
		assert.deepEqual(report.hookIds, ["PreInvocation", "Stop"]);
		assert.deepEqual(report.mcpIds, ["database", "git-bash", "lsp"]);
		assert.equal(report.activeSkillCount, 15);
		assert.deepEqual(report.experimentalIncluded, []);
		assert.equal(report.orphanCount, 0);
		assert.equal(report.bundle.verified, true);
		assert.equal(report.bundle.reconstructionValid, true);
		assert.match(report.bundle.hash, /^[a-f0-9]{64}$/);
		assert.equal(report.cleanup.runtimeRootRemoved, true);
		assert.equal(existsSync(report.runtimeRoot ?? ""), false);
		assert.equal(existsSync(join(artifactRoot, "bundle-manifest.json")), true);
		assert.equal(existsSync(join(artifactRoot, "bundle.sha256")), true);
		assert.equal(existsSync(receipt), true);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});
