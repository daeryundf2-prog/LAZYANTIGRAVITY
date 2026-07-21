import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const probe = join(root, "scripts", "probe-antigravity-ide.mjs");

test("[todo16.ide.unavailable] Given no pinned noninteractive IDE contract When probed Then it writes unavailable and exits 77 without inspecting private state", () => {
	const temp = mkdtempSync(join(tmpdir(), "todo16 ide with spaces "));
	const runtime = join(temp, "runtime.json");
	const receipt = join(temp, "ide.json");
	const isolated = join(temp, "isolated");
	const privateRoot = join(temp, "private ide state");
	mkdirSync(privateRoot);
	writeFileSync(join(privateRoot, "canary.txt"), "do-not-read-or-change");
	writeFileSync(runtime, `${JSON.stringify({ workspaceFingerprint: "0".repeat(64), validatorRuntime: { executable: process.execPath, version: process.version }, publishedRuntime: { executable: process.execPath, version: process.version } })}\n`);
	try {
		const result = spawnSync(process.execPath, [probe, "--runtime-receipt", runtime, "--receipt", receipt, "--isolated-root", isolated], {
			encoding: "utf8",
			env: { ...process.env, ANTIGRAVITY_PRIVATE_STATE_CANARY: privateRoot },
		});
		assert.equal(result.status, 77, result.stderr);
		const parsed = JSON.parse(readFileSync(receipt, "utf8"));
		assert.equal(parsed.status, "unavailable");
		assert.equal(parsed.liveStatus, "unavailable");
		assert.equal(parsed.verificationLevel, "contract-tested");
		assert.equal(readFileSync(join(privateRoot, "canary.txt"), "utf8"), "do-not-read-or-change");
		assert.equal(existsSync(isolated), false);
	} finally { rmSync(temp, { recursive: true, force: true }); }
});

test("[todo16.ide.no-guesses] Given the IDE probe source When reviewed Then it contains no process launch, guessed flag, or private-state scanner", () => {
	const source = readFileSync(probe, "utf8");
	assert.doesNotMatch(source, /spawn|execFile|execSync|child_process/);
	assert.doesNotMatch(source, /--(?:list|plugin|inspect|status)/);
	assert.doesNotMatch(source, /ANTIGRAVITY_PRIVATE_STATE_CANARY|\.gemini[\\/]config[\\/]plugins/);
});
