import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { access, copyFile, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const excludedCopyEntries = new Set([".git", ".omo", "node_modules"]);
const copyCleanCheckout = async (sourceRoot, destinationRoot) => {
	await mkdir(destinationRoot, { recursive: true });
	for (const name of (await readdir(sourceRoot)).sort()) {
		const source = join(sourceRoot, name);
		const destination = join(destinationRoot, name);
		const stats = await lstat(source);
		if (stats.isSymbolicLink()) throw new Error(`Refusing to copy symbolic link or reparse point: ${relative(root, source)}`);
		if (excludedCopyEntries.has(name)) continue;
		if (stats.isDirectory()) await copyCleanCheckout(source, destination);
		else if (stats.isFile()) await copyFile(source, destination);
		else throw new Error(`Refusing to copy unsupported filesystem entry: ${relative(root, source)}`);
	}
};
const run = (script, args = []) => spawnSync(process.execPath, [join(root, script), ...args], {
	cwd: root,
	encoding: "utf8",
	windowsHide: true,
});

const runAt = (checkoutRoot, script, args = []) => spawnSync(process.execPath, [join(checkoutRoot, script), ...args], {
	cwd: checkoutRoot,
	encoding: "utf8",
	windowsHide: true,
});

test("generated documentation is deterministic when checked", () => {
	// Given: the checked-in documentation and its source fixtures.
	// When: both deterministic generators run in check mode.
	const docs = run("scripts/generate-antigravity-docs.mjs", ["--check"]);
	const score = run("scripts/generate-antigravity-score.mjs", ["--check"]);
	// Then: neither generator observes drift.
	assert.equal(docs.status, 0, docs.stderr);
	assert.equal(score.status, 0, score.stderr);
});

test("checked-in scorecard is verifiable in a clean checkout without ignored evidence", async () => {
	// Given: an actual temporary repository copy without Git state, ignored evidence, or dependencies.
	const temporaryRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-clean-checkout-"));
	const checkoutRoot = join(temporaryRoot, "checkout");
	try {
		await copyCleanCheckout(root, checkoutRoot);
		await assert.rejects(access(join(checkoutRoot, ".omo")));

		// When: the score generator checks the tracked artifacts in that copy.
		const score = runAt(checkoutRoot, "scripts/generate-antigravity-score.mjs", ["--check"]);

		// Then: it checks frozen provenance without claiming live evidence freshness.
		assert.equal(score.status, 0, score.stderr);
		assert.equal(JSON.parse(score.stdout).evidenceMode, "frozen-checked-in");
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
});

test("experimental English and Korean guides have exact row parity", () => {
	// Given: the catalog fixture and both generated guides.
	const catalog = JSON.parse(readFileSync(join(root, "config", "antigravity-skills.json"), "utf8"));
	const modes = JSON.parse(readFileSync(join(root, "config", "experimental-skill-modes.json"), "utf8"));
	// When: generated rows are extracted from their stable data-name attributes.
	const guides = ["docs/experimental-skills.md", "docs/experimental-skills.ko.md"].map((path) =>
		readFileSync(join(root, path), "utf8"));
	const names = guides.map((text) => [...text.matchAll(/<!-- skill:([^ ]+) -->/g)].map((match) => match[1]));
	// Then: all 19 names and both unsupported modes are identical.
	const expected = catalog.experimental.map(({ name }) => name);
	assert.equal(expected.length, 19);
	assert.deepEqual(names[0], expected);
	assert.deepEqual(names[1], expected);
	for (const name of expected) assert.deepEqual(modes[name], { ide: "unsupported", cli: "unsupported" });
});

test("score JSON and Markdown expose the same exact rubric total", () => {
	// Given: the generated machine and human scorecards.
	const score = JSON.parse(readFileSync(join(root, "docs", "scorecard.json"), "utf8"));
	const report = readFileSync(join(root, "docs", "scorecard.md"), "utf8");
	// When: the human-readable total is parsed.
	const match = report.match(/Evidence-backed score: (\d+) \/ (\d+)/);
	// Then: it equals the exact 100-point JSON result.
	assert.ok(match);
	assert.equal(Number(match[1]), score.earnedPoints);
	assert.equal(Number(match[2]), score.totalPoints);
	assert.equal(score.totalPoints, 100);
	assert.equal(score.items.find((item) => item.id === "hosted-matrix").earnedPoints, 0);
});

test("score rubric exactly matches the approved capability contract", () => {
	const rubric = JSON.parse(readFileSync(join(root, "config", "score-rubric.json"), "utf8"));
	const actual = rubric.categories.map(({ id, points, items }) => ({
		id,
		points,
		items: items.map(({ id: itemId, points: itemPoints }) => [itemId, itemPoints]),
	}));
	assert.deepEqual(actual, [
		{ id: "contracts", points: 20, items: [["manifest", 5], ["hooks", 5], ["ide-layout", 5], ["cli-layout", 5]] },
		{ id: "runtime", points: 15, items: [["context", 5], ["stop", 5], ["offline-defaults", 5]] },
		{ id: "mcp-database", points: 20, items: [["lifecycle", 5], ["path-portability", 5], ["sqlite-safe-readonly", 10]] },
		{ id: "skills", points: 15, items: [["exact-core", 5], ["metadata-references", 5], ["workflow-lsp", 5]] },
		{ id: "distribution", points: 15, items: [["no-install", 5], ["snapshot-stage", 5], ["hosted-matrix", 5]] },
		{ id: "evidence-docs", points: 10, items: [["freshness", 5], ["bilingual-truth", 5]] },
		{ id: "live", points: 5, items: [["cli-install-list-live", 3], ["ide-live", 2]] },
	]);
});

test("unavailable capabilities earn exactly zero points", () => {
	const score = JSON.parse(readFileSync(join(root, "docs", "scorecard.json"), "utf8"));
	for (const id of ["sqlite-safe-readonly", "hosted-matrix", "cli-install-list-live", "ide-live"]) {
		const item = score.items.find((candidate) => candidate.id === id);
		assert.ok(item, `missing score item ${id}`);
		assert.equal(item.status, "unavailable", id);
		assert.equal(item.earnedPoints, 0, id);
		assert.equal(item.evidence, null, id);
	}
});

test("score provenance fingerprints the tracked generator and source evidence", () => {
	const score = JSON.parse(readFileSync(join(root, "docs", "scorecard.json"), "utf8"));
	const generator = readFileSync(join(root, "scripts", "generate-antigravity-score.mjs"));
	assert.equal(score.provenance.evidenceMode, "frozen-checked-in");
	assert.equal(score.provenance.generatorSha256, sha256(generator));
	assert.match(score.provenance.sourceEvidenceDigest, /^[a-f0-9]{64}$/);

	const receiptPath = join(root, ".omo", "evidence", "task-18-local-score-evidence.json");
	if (existsSync(receiptPath)) {
		const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
		assert.ok(receipt.subjectFiles.includes("scripts/generate-antigravity-score.mjs"));
		assert.equal(receipt.artifactHashes["scripts/generate-antigravity-score.mjs"], score.provenance.generatorSha256);
		assert.equal(receipt.subjectFingerprint, score.provenance.sourceEvidenceDigest);
	}
});
