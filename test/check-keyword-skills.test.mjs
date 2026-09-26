import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const checker = join(root, "scripts", "check-keyword-skills.mjs");

function writeAgents(refs) {
	const dir = mkdtempSync(join(tmpdir(), "keyword-check-"));
	const path = join(dir, "AGENTS.md");
	const rows = refs.map((ref) => `| "trigger-${ref}" | \`$${ref}\` | test row |`).join("\n");
	writeFileSync(
		path,
		`<keyword_detection>\n| Keyword | Skill | Purpose |\n|---|---|---|\n${rows}\n</keyword_detection>\n`,
	);
	return path;
}

function runChecker(...agentsPaths) {
	const result = spawnSync(process.execPath, [checker, "--json", ...agentsPaths], {
		cwd: root,
		encoding: "utf8",
	});
	return { status: result.status, report: JSON.parse(result.stdout) };
}

test("#given an aggregate skill ref #when checked #then it resolves as aggregate-skill", () => {
	const { status, report } = runChecker(writeAgents(["ulw-plan"]));
	assert.equal(status, 0);
	const row = report.results.find((r) => r.ref === "ulw-plan");
	assert.equal(row.status, "aggregate-skill");
	assert.match(row.path, /skills[/\\]ulw-plan[/\\]SKILL\.md/);
});

test("#given a reference-only ref #when checked #then it resolves as reference with a warning", () => {
	const { status, report } = runChecker(writeAgents(["swarm-sync"]));
	assert.equal(status, 0);
	const row = report.results.find((r) => r.ref === "swarm-sync");
	assert.equal(row.status, "reference");
	assert.match(row.path, /references[/\\]swarm-sync\.md/);
	assert.equal(report.warnings, 1);
});

test("#given a component-package ref #when checked #then it resolves as component-package", () => {
	const { report } = runChecker(writeAgents(["adaptive-reasoning"]));
	const row = report.results.find((r) => r.ref === "adaptive-reasoning");
	assert.equal(row.status, "component-package");
});

test("#given a dangling ref #when checked #then it fails the run", () => {
	const { status, report } = runChecker(writeAgents(["definitely-not-a-skill"]));
	assert.equal(status, 1);
	const row = report.results.find((r) => r.ref === "definitely-not-a-skill");
	assert.equal(row.status, "dangling");
	assert.equal(report.dangling, 1);
});

test("#given a missing AGENTS.md #when checked #then it reports missing-file and fails", () => {
	const { status, report } = runChecker("/nonexistent/path/AGENTS.md");
	assert.equal(status, 1);
	assert.equal(report.results[0].status, "missing-file");
});
