import assert from "node:assert/strict";
import { execSync } from "node:child_process";
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
