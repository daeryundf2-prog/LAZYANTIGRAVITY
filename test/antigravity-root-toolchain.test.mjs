import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

function runNode(script, args = [], options = {}) {
	return spawnSync(validatorNode, [join(root, script), ...args], {
		cwd: options.cwd ?? root,
		encoding: "utf8",
		env: options.env ?? process.env,
		windowsHide: true,
	});
}

test("root package is dependency-free and exposes only validator scripts", async () => {
	const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

	for (const key of ["workspaces", "dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
		assert.equal(packageJson[key], undefined, `root package must omit ${key}`);
	}
	assert.deepEqual(packageJson.scripts, {
		check: "node scripts/validate-root-toolchain.mjs",
		"rebuild:maintainer": "node scripts/rebuild-components.mjs",
		"sync:skills": "node scripts/sync-skills.mjs",
		test: "node scripts/run-tests.mjs",
		"validate:distribution": "node scripts/validate-antigravity-distribution.mjs",
	});
	assert.doesNotMatch(JSON.stringify(packageJson.scripts), /(?:\bbun\b|npm\s+(?:ci|install)|https?:|file:)/i);

	const syncSource = await readFile(join(root, "scripts", "sync-skills.mjs"), "utf8");
	assert.match(syncSource, /from\s+["']\.\.\/shared-skills\/index\.mjs["']/);
	assert.doesNotMatch(syncSource, /@oh-my-opencode\/shared-skills/);
});

test("preserved baseline routine remains byte-identical", async () => {
	const preserved = await readFile(join(root, "scripts", "toolchain", "preserved-baseline-snapshot.mjs"));
	assert.equal(sha256(preserved), "327e4eacf0a262e2a5169023fc88c711a1ff0e01683e8150eb19323c9736f91f");
	assert.equal(preserved.byteLength, 15680);
});

test("evidence schema is closed and rubric is the exact 100-point contract", async () => {
	const schema = JSON.parse(await readFile(join(root, "config", "evidence.schema.json"), "utf8"));
	assert.equal(schema.additionalProperties, false);
	for (const key of [
		"task", "surface", "capability", "snapshotKind", "subjectFiles", "subjectFingerprint",
		"workspaceFingerprint", "status", "command", "validatorRuntime", "publishedRuntime", "os",
		"startedAt", "finishedAt", "exitCode", "assertionIds", "artifactHashes",
	]) assert.ok(schema.required.includes(key), `missing evidence field ${key}`);
	assert.deepEqual(schema.properties.snapshotKind.enum, ["baseline", "task-red", "final"]);
	assert.deepEqual(schema.properties.status.enum, ["passed", "failed", "skipped", "unavailable", "stale"]);
	assert.deepEqual(schema.$defs.verificationLevel.enum, [
		"unverified", "contract-tested", "staged-process-verified", "live-verified", "experimental", "unsupported",
	]);
	assert.deepEqual(schema.$defs.liveStatus.enum, ["unavailable", "skipped", "failed", "passed", "stale"]);

	const rubric = JSON.parse(await readFile(join(root, "config", "score-rubric.json"), "utf8"));
	const items = rubric.categories.flatMap((category) => category.items);
	assert.equal(items.reduce((sum, item) => sum + item.points, 0), 100);
	assert.equal(new Set(items.map((item) => item.id)).size, items.length);
	assert.equal(rubric.awardRule, "fresh-passed-receipt-only");
	assert.equal(items.find((item) => item.id === "hosted-matrix").localEvidenceEligible, false);
});

test("preflight distinguishes validator Node from literal PATH Node and freezes PATH", () => {
	const goodPath = `${dirname(validatorNode)}${delimiter}${process.env.PATH ?? ""}`;
	const success = runNode("scripts/preflight.mjs", [], { env: { ...process.env, PATH: goodPath } });
	assert.equal(success.status, 0, success.stderr);
	const receipt = JSON.parse(success.stdout);
	assert.equal(nodeAtLeast(receipt.validatorRuntime.version, [20, 17, 0]), true);
	assert.equal(nodeAtLeast(receipt.publishedRuntime.version, [20, 17, 0]), true);
	assert.equal(receipt.executionEnvironment.pathFrozen, true);
	assert.equal(receipt.executionEnvironment.pathSha256, sha256(goodPath));

	const failure = runNode("scripts/preflight.mjs");
	assert.notEqual(failure.status, 0);
	assert.match(failure.stderr, /\[preflight\.runtime\.published\]/);
	assert.equal(failure.stdout, "");
});

test("component rebuild sources are explicit and maintainer-only", async () => {
	const sources = JSON.parse(await readFile(join(root, "config", "component-sources.json"), "utf8"));
	assert.equal(sources.maintainerOnly, true);
	assert.deepEqual(sources.components.map((item) => item.path), [
		"components/comment-checker", "components/git-bash", "components/lsp", "components/rules",
		"components/start-work-continuation", "components/ultrawork", "components/ulw-loop",
	]);
	assert.deepEqual(sources.bundledRuntimes.map((item) => item.path), [
		"components/git-bash-mcp", "components/lsp-daemon", "components/lsp-tools-mcp",
	]);
});

test("evidence validator rejects stale and wrong-subject receipts", async () => {
	const subject = await mkdtemp(join(tmpdir(), "lazyantigravity-evidence-subject-"));
	const receiptPath = join(subject, "receipt.json");
	try {
		await writeFile(join(subject, "input.txt"), "original\n");
		const invalidReceipt = {
			task: "fixture", surface: "toolchain", capability: "freshness", snapshotKind: "final",
			subjectFiles: ["input.txt"], subjectFingerprint: "0".repeat(64), workspaceFingerprint: "1".repeat(64),
			status: "passed", command: "fixture", validatorRuntime: { version: "v20.17.0", executable: "node" },
			publishedRuntime: { version: "v20.17.0", executable: "node" }, os: { platform: process.platform, arch: process.arch },
			startedAt: "2026-07-10T00:00:00.000Z", finishedAt: "2026-07-10T00:00:01.000Z", exitCode: 0,
			assertionIds: ["evidence.freshness"], artifactHashes: { input: sha256("original\n") },
		};
		await writeFile(receiptPath, `${JSON.stringify(invalidReceipt, null, 2)}\n`);
		const result = runNode("scripts/validate-evidence.mjs", [receiptPath, "--subject-root", subject]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /\[evidence\.subject\.stale\]/);
		assert.equal(result.stdout, "");
	} finally {
		await rm(subject, { recursive: true, force: true });
	}
});
