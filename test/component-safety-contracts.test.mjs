import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAutoUpdateCheck, runLazyCodexManualUpdate, resolveAutoUpdatePlan } from "../scripts/auto-update.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("offline updater overrides opt-ins before state writes or commands", async () => {
	const env = { LAZYANTIGRAVITY_OFFLINE: "1", ANTIGRAVITY_AUTO_UPDATE_SOURCE: "fake-package" };
	assert.equal(resolveAutoUpdatePlan({ env }).reason, "offline");
	assert.deepEqual(await runAutoUpdateCheck({ env }), { started: false, reason: "offline" });
	assert.equal(await runLazyCodexManualUpdate({ env, runCommand: () => { assert.fail("must not execute"); } }), 1);
});

test("startup updater does not attempt git by default or offline", () => {
	for (const extra of [{ LAZYANTIGRAVITY_UPDATE_CHECK: "" }, { LAZYANTIGRAVITY_UPDATE_CHECK: "1", LAZYANTIGRAVITY_OFFLINE: "1" }]) {
		const guard = "data:text/javascript," + encodeURIComponent("import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';cp.spawnSync=()=>{throw new Error('unexpected subprocess attempt')};syncBuiltinESMExports();");
		const result = spawnSync(process.execPath, ["--import", guard, join(root, "scripts/update-check.mjs")], { encoding: "utf8", env: { PATH: "", ...extra } });
		assert.equal(result.status, 0);
		assert.equal(result.stdout, "");
		assert.equal(result.stderr, "");
	}
});

test("hook failure persistence scrubs fake secrets through the shared redactor", () => {
	const cwd = mkdtempSync(join(tmpdir(), "hook-redaction-"));
	try {
		const secret = "sk-fake_secret_1234567890";
		const result = spawnSync(process.execPath, [join(root, "scripts/hook-runner.mjs"), "FAIL_CLOSED", "none", "none", process.execPath, "-e", `process.stderr.write(${JSON.stringify(secret)});process.exit(1)`], { cwd, input: "{}", encoding: "utf8", env: { ...process.env, HOME: cwd, LAZYANTIGRAVITY_OFFLINE: "1" } });
		assert.equal(result.status, 1);
		const persisted = readFileSync(join(cwd, ".lazyantigravity/telemetry/events.jsonl"), "utf8");
		assert.ok(!persisted.includes(secret));
		assert.match(persisted, /REDACTED/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
