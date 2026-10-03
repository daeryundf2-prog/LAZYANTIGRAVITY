import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { MARKER_FILES, getMarkerContent } from "../scripts/lib/model-profile-renderer.mjs";

const execFile = promisify(execFileCallback);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(root, "scripts", "apply-model-profile.mjs");

test("#given model-catalog.json #when inspected #then antigravity profile declarations are valid", async () => {
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));
	const antigravity = catalog.antigravity;

	assert.equal(typeof antigravity?.activeProfile, "string");
	assert.equal(antigravity.activeProfile, "gemini38-claude55");

	const profiles = antigravity.profiles;
	assert.ok(profiles);
	assert.equal(profiles["gemini38-claude55"]?.status, "active");
	assert.equal(profiles.argon?.status, "pending");

	for (const profileName of ["gemini38-claude55", "argon"]) {
		const prof = profiles[profileName];
		assert.ok(prof.displayName);
		assert.ok(prof.description);
		assert.ok(prof.lanes);
		assert.ok(prof.fallbackTable);
	}

	const plannerChain = antigravity.roles.planner.fallbackChain;
	const sonnetIdx = plannerChain.indexOf("claude-sonnet-5.5-high");
	const opusIdx = plannerChain.indexOf("claude-opus-5.5-high");
	const geminiIdx = plannerChain.indexOf("gemini-3.1-pro-high");
	assert.ok(geminiIdx !== -1 && sonnetIdx !== -1 && opusIdx !== -1);
	assert.ok(geminiIdx < sonnetIdx, "Gemini before Sonnet in fallback");
	assert.ok(sonnetIdx < opusIdx, "Sonnet before Opus in fallback");
});

test("#given pending profile argon #when activation attempted without --display #then CLI rejects with code 1", async () => {
	let failed = false;
	try {
		await execFile(process.execPath, [scriptPath, "argon", "--no-build"], { cwd: root });
	} catch (err) {
		failed = true;
		assert.equal(err.code, 1);
		assert.match(err.stderr, /Cannot activate pending profile 'argon' without --display/);
	}
	assert.equal(failed, true, "Expected argon activation without --display to fail");
});

test("#given temporary workspace fixture #when round-tripping A -> argon -> A #then markers restore byte-identically", async () => {
	const tmp = await mkdtemp(join(tmpdir(), "model-profile-test-"));
	try {
		await cp(join(root, "model-catalog.json"), join(tmp, "model-catalog.json"));
		for (const fileInfo of MARKER_FILES) {
			const targetPath = join(tmp, fileInfo.path);
			await mkdir(dirname(targetPath), { recursive: true });
			await cp(join(root, fileInfo.path), targetPath);
		}

		const originals = new Map();
		for (const fileInfo of MARKER_FILES) {
			originals.set(fileInfo.path, await readFile(join(tmp, fileInfo.path), "utf8"));
		}

		await execFile(
			process.execPath,
			[scriptPath, "argon", "--display", "Gemini 4 Argon (High)", "--tiers", "medium,high", "--no-build", "--root", tmp],
			{ cwd: root },
		);

		for (const fileInfo of MARKER_FILES) {
			const argonContent = await readFile(join(tmp, fileInfo.path), "utf8");
			assert.notEqual(argonContent, originals.get(fileInfo.path));
			const rendered = fileInfo.markers.map((id) => getMarkerContent(argonContent, id)).join("\n");
			assert.ok(rendered.includes("Gemini 4 Argon"), `${fileInfo.path} should render the --display name`);
			assert.ok(!rendered.includes("Gemini 4 Pro Argon"), `${fileInfo.path} still carries the placeholder name`);
			assert.ok(!/\{(model|modelBase|verifyLane)\}/.test(rendered), `${fileInfo.path} has unfilled placeholders`);
		}
		const activated = JSON.parse(await readFile(join(tmp, "model-catalog.json"), "utf8")).antigravity;
		assert.equal(activated.activeProfile, "argon");
		assert.equal(activated.roles.verifier.fallbackChain[0], "gemini-4-argon-high");
		assert.ok(activated.availableModels.some((m) => m.modelId === "gemini-4-argon-medium"));

		await execFile(
			process.execPath,
			[scriptPath, "gemini38-claude55", "--no-build", "--root", tmp],
			{ cwd: root },
		);

		for (const fileInfo of MARKER_FILES) {
			const restored = await readFile(join(tmp, fileInfo.path), "utf8");
			assert.equal(restored, originals.get(fileInfo.path), `${fileInfo.path} did not restore byte-identically`);
		}
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
});

test("#given repository working tree #when apply-model-profile --check is executed #then check passes with code 0", async () => {
	const { stdout } = await execFile(process.execPath, [scriptPath, "--check"], { cwd: root });
	assert.match(stdout, /Active profile 'gemini38-claude55' check passed; no drift\./);
});
