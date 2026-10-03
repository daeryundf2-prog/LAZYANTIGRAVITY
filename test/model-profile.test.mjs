import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { MARKER_FILES, getMarkerContent } from "../scripts/lib/model-profile-renderer.mjs";

const execFile = promisify(execFileCallback);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(root, "scripts", "apply-model-profile.mjs");
const PLACEHOLDER_NAME = "Gemini 4 Pro Argon (High)";

// Tests must pass on release day too (argon active), so every CLI run targets a temp fixture
// whose catalog is reset to "argon pending, gemini38-claude55 active" regardless of the live state.
async function makePendingFixture() {
	const tmp = await mkdtemp(join(tmpdir(), "model-profile-test-"));
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));
	const argon = catalog.antigravity.profiles.argon;
	argon.status = "pending";
	argon.modelName = PLACEHOLDER_NAME;
	for (const pm of argon.pendingModels ?? []) pm.availability = "pending";
	catalog.antigravity.activeProfile = "gemini38-claude55";
	await writeFile(join(tmp, "model-catalog.json"), `${JSON.stringify(catalog, null, "\t")}\n`);
	for (const fileInfo of MARKER_FILES) {
		const targetPath = join(tmp, fileInfo.path);
		await mkdir(dirname(targetPath), { recursive: true });
		await cp(join(root, fileInfo.path), targetPath);
	}
	await runCli(["gemini38-claude55", "--no-build", "--root", tmp]);
	return tmp;
}

function runCli(args) {
	return execFile(process.execPath, [scriptPath, ...args], { cwd: root });
}

async function expectCliFailure(args, stderrPattern) {
	await assert.rejects(runCli(args), (err) => {
		assert.equal(err.code, 1);
		assert.match(err.stderr, stderrPattern);
		return true;
	});
}

test("#given model-catalog.json #when inspected #then the active profile exists and both profiles are complete", async () => {
	const { antigravity } = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));
	const active = antigravity.profiles?.[antigravity.activeProfile];
	assert.ok(active, `activeProfile '${antigravity.activeProfile}' must exist`);
	assert.notEqual(active.status, "pending");

	const markerIds = MARKER_FILES.flatMap((f) => f.markers).filter((id) => id !== "ulw-loop-fallback");
	for (const name of ["gemini38-claude55", "argon"]) {
		const prof = antigravity.profiles[name];
		for (const field of ["displayName", "description", "lanes", "fallbackTable", "guide"]) {
			assert.ok(prof[field], `${name}.${field} missing`);
		}
		for (const id of markerIds) assert.ok(Array.isArray(prof.guide[id]), `${name}.guide.${id} missing`);
	}

	const chain = antigravity.roles.planner.fallbackChain;
	const [gemini, sonnet, opus] = ["gemini-3.1-pro-high", "claude-sonnet-5.5-high", "claude-opus-5.5-high"].map((id) =>
		chain.indexOf(id),
	);
	assert.ok(gemini !== -1 && sonnet !== -1 && opus !== -1);
	assert.ok(gemini < sonnet, "Gemini before Sonnet in fallback");
	assert.ok(sonnet < opus, "Sonnet before Opus in fallback");
});

test("#given a pending argon fixture #when activated without --display #then the CLI rejects with code 1", async () => {
	const tmp = await makePendingFixture();
	try {
		await expectCliFailure(["argon", "--no-build", "--root", tmp], /Cannot activate pending profile 'argon' without --display/);
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
});

test("#given malformed flags #when the CLI parses them #then it rejects instead of ignoring them", async () => {
	const tmp = await makePendingFixture();
	try {
		await expectCliFailure(["argon", "--root", tmp, "--no-build", "--display"], /--display requires a value/);
		await expectCliFailure(["argon", "--display", "X (High)", "--tiers", "", "--root", tmp, "--no-build"], /--tiers/);
		await expectCliFailure(["argon", "--verify-lane", "opus", "--root", tmp, "--no-build"], /--verify-lane/);
		await expectCliFailure(["argon", "--bogus", "--root", tmp, "--no-build"], /Unknown option '--bogus'/);
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
});

test("#given a pending argon fixture #when round-tripping A -> argon -> A #then markers restore byte-identically", async () => {
	const tmp = await makePendingFixture();
	try {
		const originals = new Map();
		for (const fileInfo of MARKER_FILES) {
			originals.set(fileInfo.path, await readFile(join(tmp, fileInfo.path), "utf8"));
		}

		await runCli(["argon", "--display", "Gemini 4 Argon (High)", "--tiers", "medium,high", "--no-build", "--root", tmp]);

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

		await runCli(["gemini38-claude55", "--no-build", "--root", tmp]);

		for (const fileInfo of MARKER_FILES) {
			const restored = await readFile(join(tmp, fileInfo.path), "utf8");
			assert.equal(restored, originals.get(fileInfo.path), `${fileInfo.path} did not restore byte-identically`);
		}
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
});

test("#given repository working tree #when apply-model-profile --check is executed #then check passes with code 0", async () => {
	const { stdout } = await runCli(["--check"]);
	assert.match(stdout, /Active profile '[\w-]+' check passed; no drift\./);
});
