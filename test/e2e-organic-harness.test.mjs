import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const awtScript = join(root, "scripts", "awt-guard.mjs");
const selfAuditScript = join(root, "scripts", "self-audit.mjs");
const ulwReadinessScript = join(root, "scripts", "ulw-readiness.mjs");
const flakyRunnerScript = join(root, "scripts", "flaky-stress-runner.mjs");

test("ORGANIC STEP 1: AWT Guard locks trajectory and blocks metacognitive failure loops", () => {
	// 1. Normal tool execution payload
	const normalPayload = JSON.stringify({
		tool_name: "view_file",
		tool_input: { AbsolutePath: join(root, "package.json") }
	});
	const normalOutput = execSync(`node "${awtScript}"`, { input: normalPayload, encoding: "utf8" });
	const normalJson = JSON.parse(normalOutput.trim());
	assert.match(normalJson.additionalContext, /AWT Contract/);
	assert.doesNotMatch(normalJson.additionalContext, /METANARRATIVE ABORT/);

	// 2. Metacognitive excuse interception (흥미롭군요)
	const excusePayload = JSON.stringify({ message: "흥미롭군요. 왜 에러가 났는지 살펴봅시다." });
	const excuseOutput = execSync(`node "${awtScript}"`, { input: excusePayload, encoding: "utf8" });
	const excuseJson = JSON.parse(excuseOutput.trim());
	assert.match(excuseJson.additionalContext, /METANARRATIVE ABORT/);
	assert.match(excuseJson.additionalContext, /흥미롭군요/);
});

test("ORGANIC STEP 2: Self-Audit CLI traces trajectory ledger and reports branch modifications", () => {
	const auditOutput = execSync(`node "${selfAuditScript}" --json`, { cwd: root, encoding: "utf8" });
	const report = JSON.parse(auditOutput.trim());

	assert.ok(report.branch);
	assert.ok(Array.isArray(report.changed_files));
	assert.ok(Array.isArray(report.recent_commits));
	assert.equal(typeof report.changed_files_count, "number");
});

test("ORGANIC STEP 3: Stop-Hook (ulw-readiness) gates completion against unverified goals", () => {
	const mockRepo = join(root, ".tmp-organic-test-repo");
	if (existsSync(mockRepo)) rmSync(mockRepo, { recursive: true, force: true });
	mkdirSync(join(mockRepo, ".omo", "ulw-loop"), { recursive: true });

	try {
		// 1. Unfinished goal -> Must produce HARD STOP
		writeFileSync(
			join(mockRepo, ".omo", "ulw-loop", "goals.json"),
			JSON.stringify({
				goals: [{ id: "G1", name: "Refactor Auth", status: "in_progress" }]
			})
		);

		const unverifiedOutput = execSync(`node "${ulwReadinessScript}"`, {
			env: { ...process.env, OMO_REPO_ROOT: mockRepo },
			encoding: "utf8"
		});
		const unverifiedJson = JSON.parse(unverifiedOutput.trim());
		assert.match(unverifiedJson.additionalContext, /LazyAntigravity HARD STOP/);
		assert.match(unverifiedJson.additionalContext, /1 ULW goal\(s\) still open/);

		// 2. Completed goal -> Clean pass
		writeFileSync(
			join(mockRepo, ".omo", "ulw-loop", "goals.json"),
			JSON.stringify({
				goals: [{ id: "G1", name: "Refactor Auth", status: "completed" }]
			})
		);

		const completedOutput = execSync(`node "${ulwReadinessScript}"`, {
			env: { ...process.env, OMO_REPO_ROOT: mockRepo },
			encoding: "utf8"
		});
		const completedJson = JSON.parse(completedOutput.trim());
		assert.doesNotMatch(completedJson.additionalContext || "", /HARD STOP/);
	} finally {
		rmSync(mockRepo, { recursive: true, force: true });
	}
});

test("ORGANIC STEP 4: Flaky-Stress-Runner executes parallel deterministic validation", () => {
	// Execute 5-concurrency 5-iteration stress test on a simple fast command
	const stressOutput = execSync(
		`node "${flakyRunnerScript}" --concurrency=5 --iterations=5 "node -e 'process.exit(0)'"`,
		{ cwd: root, encoding: "utf8" }
	);
	assert.match(stressOutput, /5\/5 PASS/i);
});

test("ORGANIC STEP 5: Doctor verifies whole-system integrity across all 34 skills and hooks", () => {
	const doctorScript = join(root, "scripts", "lazyantigravity-doctor.mjs");
	const doctorOutput = execSync(`node "${doctorScript}" --json`, { cwd: root, encoding: "utf8" });
	const report = JSON.parse(doctorOutput.trim());

	assert.equal(report.status, "pass");
	assert.equal(report.manifests.status, "pass");
	assert.equal(report.hooks.status, "pass");
	assert.equal(report.mcp.status, "pass");
	assert.equal(report.skills.status, "pass");
	assert.equal(report.bundles.status, "pass");
	assert.equal(report.versions.status, "pass");
});
