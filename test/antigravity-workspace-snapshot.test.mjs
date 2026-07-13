import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function parseNodeVersion(version) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
	assert.ok(match, `unparseable Node version: ${version}`);
	return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function nodeAtLeast(version, minimum) {
	const actual = parseNodeVersion(version);
	for (let index = 0; index < minimum.length; index += 1) {
		if (actual[index] > minimum[index]) return true;
		if (actual[index] < minimum[index]) return false;
	}
	return true;
}

function findValidatorNode() {
	const candidates = [
		process.execPath,
		join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", process.platform === "win32" ? "node.exe" : "node"),
	];
	for (const candidate of candidates) {
		const result = spawnSync(candidate, ["-p", "process.version"], { encoding: "utf8", windowsHide: true });
		if (result.status === 0 && nodeAtLeast(result.stdout, [20, 17, 0])) return candidate;
	}
	throw new Error("Todo 5 tests require a Node >=20.17 validator runtime");
}

const validatorNode = findValidatorNode();

function runBuilder(args) {
	return spawnSync(validatorNode, [join(root, "scripts", "build-workspace-snapshot.mjs"), ...args], {
		cwd: root,
		encoding: "utf8",
		windowsHide: true,
	});
}

async function fixture() {
	const fixtureRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-snapshot-fixture-"));
	const subject = join(fixtureRoot, "subject");
	await mkdir(join(subject, "nested"), { recursive: true });
	await writeFile(join(subject, "package.json"), "{}\n");
	await writeFile(join(subject, "nested", "tracked.txt"), "tracked\n");
	await writeFile(join(subject, "nested", "untracked.txt"), "untracked\n");
	return { fixtureRoot, subject };
}

test("snapshot copies every explicit regular file and is deterministic", async () => {
	const { fixtureRoot, subject } = await fixture();
	const manifest = join(fixtureRoot, "manifest.json");
	const first = join(fixtureRoot, "first");
	const second = join(fixtureRoot, "second");
	try {
		await writeFile(manifest, `${JSON.stringify({ schemaVersion: 1, files: ["package.json"], directories: ["nested"] }, null, 2)}\n`);
		const firstResult = runBuilder(["--subject-root", subject, "--destination", first, "--manifest", manifest, "--snapshot-kind", "final"]);
		assert.equal(firstResult.status, 0, firstResult.stderr);
		const firstReceipt = JSON.parse(firstResult.stdout);
		assert.deepEqual(firstReceipt.subjectFiles, ["nested/tracked.txt", "nested/untracked.txt", "package.json"]);
		assert.equal(await readFile(join(first, "nested", "untracked.txt"), "utf8"), "untracked\n");

		const secondResult = runBuilder(["--subject-root", subject, "--destination", second, "--manifest", manifest, "--snapshot-kind", "final"]);
		assert.equal(secondResult.status, 0, secondResult.stderr);
		assert.equal(JSON.parse(secondResult.stdout).subjectFingerprint, firstReceipt.subjectFingerprint);
	} finally {
		await rm(fixtureRoot, { recursive: true, force: true });
	}
});

test("snapshot rejects path escapes, aliases, special paths, and case collisions", async () => {
	const invalidEntries = ["", ".", "..", "../escape", "/absolute", "C:/drive", "//server/share", "nested\\file"];
	for (const entry of invalidEntries) {
		const { fixtureRoot, subject } = await fixture();
		try {
			const manifest = join(fixtureRoot, "manifest.json");
			await writeFile(manifest, `${JSON.stringify({ schemaVersion: 1, files: [entry], directories: [] })}\n`);
			const result = runBuilder(["--subject-root", subject, "--destination", join(fixtureRoot, "out"), "--manifest", manifest]);
			assert.notEqual(result.status, 0, entry);
			assert.match(result.stderr, /\[snapshot\.path\.invalid\]/, entry);
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	}

	const { fixtureRoot, subject } = await fixture();
	try {
		await writeFile(join(subject, "Case.txt"), "a");
		await writeFile(join(subject, "case.txt"), "b");
		const manifest = join(fixtureRoot, "manifest.json");
		await writeFile(manifest, `${JSON.stringify({ schemaVersion: 1, files: ["Case.txt", "case.txt"], directories: [] })}\n`);
		const result = runBuilder(["--subject-root", subject, "--destination", join(fixtureRoot, "out"), "--manifest", manifest]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /\[snapshot\.path\.case-collision\]/);
	} finally {
		await rm(fixtureRoot, { recursive: true, force: true });
	}
});

test("snapshot rejects a symlink or junction without dereferencing it", async (t) => {
	const { fixtureRoot, subject } = await fixture();
	const external = join(fixtureRoot, "external");
	try {
		await mkdir(external);
		await writeFile(join(external, "secret.txt"), "secret\n");
		try {
			await symlink(external, join(subject, "linked"), process.platform === "win32" ? "junction" : "dir");
		} catch (error) {
			t.skip(`symlink unavailable: ${error.code ?? error.message}`);
			return;
		}
		const manifest = join(fixtureRoot, "manifest.json");
		await writeFile(manifest, `${JSON.stringify({ schemaVersion: 1, files: [], directories: ["linked"] })}\n`);
		const out = join(fixtureRoot, "out");
		const result = runBuilder(["--subject-root", subject, "--destination", out, "--manifest", manifest]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /\[snapshot\.path\.reparse\]/);
		await assert.rejects(access(join(out, "linked", "secret.txt")));
	} finally {
		await rm(fixtureRoot, { recursive: true, force: true });
	}
});
