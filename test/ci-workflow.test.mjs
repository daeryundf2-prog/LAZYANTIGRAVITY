import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const validator = join(root, "scripts", "validate-ci-workflow.mjs");
const workflow = join(root, ".github", "workflows", "ci.yml");
const versionComment = /[ \t]+# v\d+\.\d+\.\d+[ \t]*$/gm;

function validate(path = workflow) {
	return spawnSync(process.execPath, [validator, path], { cwd: root, encoding: "utf8", windowsHide: true });
}

function mutation(change) {
	const tempRoot = mkdtempSync(join(tmpdir(), "lazyantigravity-ci-red-"));
	const path = join(tempRoot, "ci.yml");
	const source = JSON.parse(readFileSync(workflow, "utf8").replace(versionComment, ""));
	change(source);
	writeFileSync(path, `${JSON.stringify(source, null, 2)}\n`);
	return { path, cleanup: () => rmSync(tempRoot, { recursive: true, force: true }) };
}

test("Given the checked-in JSON workflow, when validated, then every CI contract passes", () => {
	const result = validate();
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(result.stdout), { status: "passed", combinations: 4, hostedMatrix: "unavailable" });
});

test("Given validatorRuntime is omitted from the runtime receipt, when validated, then the mutation is rejected", () => {
	const fixture = mutation((value) => {
		const provision = value.jobs.cli_live.steps.find((step) => step.name === "Provision runtime receipt");
		provision.run = provision.run.replace(",validatorRuntime:runtime", "");
	});
	try {
		const result = validate(fixture.path);
		assert.notEqual(result.status, 0, "workflow validator accepted a runtime receipt without validatorRuntime");
		assert.match(result.stderr, /^\[ci\.runtime-receipt\]/);
	} finally {
		fixture.cleanup();
	}
});

for (const [name, change] of [
	["an install step is added", (value) => value.jobs.core.steps.splice(2, 0, { name: "Install", run: "npm install" })],
	["a matrix row is removed", (value) => value.jobs.core.strategy.matrix.node.pop()],
	["the SQLite gate stops failing closed", (value) => { delete value.jobs.real_sqlite.env; }],
	["continue-on-error is enabled", (value) => { value.jobs.core["continue-on-error"] = true; }],
	["an action uses a mutable major tag", (value) => { value.jobs.core.steps[0].uses = "actions/checkout@v4"; }],
	["exit 77 is converted directly to success", (value) => {
		value.jobs.cli_live.steps.find((step) => step.name === "CLI live status").run = "node scripts/smoke-agy-plugin.mjs || exit 0";
	}],
]) {
	test(`Given ${name}, when validated, then the mutation is rejected`, () => {
		const fixture = mutation(change);
		try {
			const result = validate(fixture.path);
			assert.notEqual(result.status, 0, result.stdout);
			assert.match(result.stderr, /^\[ci\./);
		} finally {
			fixture.cleanup();
		}
	});
}
