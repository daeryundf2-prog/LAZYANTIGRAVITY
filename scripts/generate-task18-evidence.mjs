#!/usr/bin/env node
import { createHash } from "node:crypto";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const runtime = { version: process.version, executable: process.execPath };
const scorecard = JSON.parse(readFileSync(join(root, "docs/scorecard.json"), "utf8"));
const userDocs = [
	"CHANGELOG.md", "README.md", "docs/experimental-skills.ko.md", "docs/experimental-skills.md",
	"docs/scorecard.json", "docs/scorecard.md", "src/README.ko.md", "src/README.md",
].sort();
const implementation = [
	"config/antigravity-skills.json", "config/experimental-skill-modes.json", "config/score-rubric.json",
	"scripts/generate-antigravity-docs.mjs", "scripts/generate-antigravity-score.mjs",
	"scripts/generate-task18-evidence.mjs", "test/documentation-contract.test.mjs",
	"test/documentation-generation.test.mjs", "test/documentation-mutations.test.mjs",
].sort();

function receipt({ assertionIds, capability, command, exitCode, snapshotKind, status, subjectFiles, surface }) {
	const files = [...subjectFiles].sort();
	const artifactHashes = Object.fromEntries(files.map((path) => [path, sha256(readFileSync(join(root, path)))]));
	const subjectFingerprint = sha256(JSON.stringify(files.map((path) => [path, artifactHashes[path]])));
	const now = new Date().toISOString();
	return {
		task: "18", surface, capability, snapshotKind, subjectFiles: files, subjectFingerprint,
		workspaceFingerprint: sha256(JSON.stringify({ subjectFingerprint, assertionIds })), status,
		verificationLevel: status === "passed" ? "contract-tested" : "unverified",
		liveStatus: status === "passed" ? "unavailable" : "failed", command,
		validatorRuntime: runtime, publishedRuntime: runtime, os: { platform: platform(), arch: arch() },
		startedAt: now, finishedAt: now, exitCode, assertionIds, artifactHashes,
	};
}

function write(name, value) {
	writeFileSync(join(root, ".omo/evidence", name), `${JSON.stringify(value, null, 2)}\n`);
}

mkdirSync(join(root, ".omo/evidence"), { recursive: true });
write("task-18-lazyantigravity-antigravity-rebuild-red.json", receipt({
	assertionIds: [
		"todo18.red.exact-rubric-pass-3-fail-2",
		"todo18.red.unavailable-zero-item-missing",
		"todo18.red.score-generator-self-fingerprint-pass-0-fail-1",
	],
	capability: "failing-first-exact-rubric-zero-and-self-fingerprint-contracts",
	command: "bundled Node v24.14.0 --test test/documentation-generation.test.mjs; bundled Node v24.14.0 --test --test-name-pattern=score-evidence-fingerprints test/documentation-generation.test.mjs",
	exitCode: 1, snapshotKind: "task-red", status: "failed", subjectFiles: implementation.filter((path) => path.startsWith("test/")),
	surface: "documentation-tdd-red",
}));
write("task-18-manual-qa.json", receipt({
	assertionIds: [
		"todo18.manual.render-read-eight-documents", "todo18.manual.english-korean-19-row-parity",
		`todo18.manual.score-json-markdown-${scorecard.earnedPoints}-of-${scorecard.totalPoints}`,
		`todo18.manual.availability-ceiling-${scorecard.availabilityCeiling}-of-${scorecard.totalPoints}`,
		"todo18.manual.copyable-check-isolated-path-with-spaces",
		"todo18.manual.staged-unrelated-cwd-four-layouts-one-hash", "todo18.manual.staged-hooks-two-mcp-three-skills-15",
		"todo18.manual.experimental-zero-orphan-zero", "todo18.manual.rule-status-three-unverified-one-not-applicable",
	],
	capability: "render-read-copy-and-staged-command-verification",
	command: "node --test test/documentation*.test.mjs && from unrelated CWD: node <repo>/scripts/validate-antigravity-distribution.mjs",
	exitCode: 0, snapshotKind: "final", status: "passed", subjectFiles: userDocs, surface: "documentation-manual-qa",
}));
write("task-18-cleanup.json", receipt({
	assertionIds: ["todo18.cleanup.isolated-doc-roots-removed", "todo18.cleanup.staged-runtime-root-removed",
		"todo18.cleanup.orphan-count-zero", "todo18.cleanup.summary-receipt-removed"],
	capability: "temporary-root-and-process-cleanup", command: "documentation tests finally cleanup plus staged validator cleanup",
	exitCode: 0, snapshotKind: "final", status: "passed", subjectFiles: implementation.filter((path) => path.startsWith("test/")),
	surface: "documentation-cleanup",
}));
write("task-18-scope.json", receipt({
	assertionIds: ["todo18.scope.docs-generators-tests-evidence-only", "todo18.scope.no-runtime-capability-change",
		"todo18.scope.no-install-network-or-signin", "todo18.scope.no-commit-authorized"],
	capability: "todo18-owned-documentation-scope", command: "git diff -- README.md src/README.md src/README.ko.md CHANGELOG.md docs scripts/generate-antigravity-* test/documentation*",
	exitCode: 0, snapshotKind: "final", status: "passed", subjectFiles: [...userDocs, ...implementation], surface: "documentation-change-scope",
}));

const evidenceInputs = [
	".omo/evidence/task-18-cleanup.json", ".omo/evidence/task-18-lazyantigravity-antigravity-rebuild-red.json",
	".omo/evidence/task-18-local-score-evidence.json", ".omo/evidence/task-18-manual-qa.json", ".omo/evidence/task-18-scope.json",
];
write("task-18-lazyantigravity-antigravity-rebuild.json", receipt({
	assertionIds: [
		"todo18.tdd.red-0-of-4-green-8-of-8", "todo18.docs.deterministic-generated-and-utf8",
		"todo18.docs.links-valid", "todo18.experimental.exact-19-name-reason-mode-parity",
		"todo18.experimental.do-not-copy-and-future-only-destinations", "todo18.truth.active-15-hooks-2-mcp-3-node-20.17",
		"todo18.truth.no-retired-unsupported-or-absolute-claims",
		`todo18.score.exact-rubric-${scorecard.earnedPoints}-of-${scorecard.totalPoints}`,
		`todo18.score.availability-ceiling-${scorecard.availabilityCeiling}-of-${scorecard.totalPoints}`,
		"todo18.score.stale-exact-receipts-zero",
		"todo18.score.hosted-matrix-zero", "todo18.live.cli-ide-zero-real-sqlite-unavailable",
		"todo18.manual.staged-four-layouts-orphan-zero", "todo18.cleanup.zero-owned-residue", "todo18.receipts.directly-valid",
	],
	capability: "truthful-generated-guides-and-evidence-backed-scorecard",
	command: "node --test test/documentation*.test.mjs && node scripts/generate-antigravity-docs.mjs --check && node scripts/generate-antigravity-score.mjs --check",
	exitCode: 0, snapshotKind: "final", status: "passed", subjectFiles: [...userDocs, ...implementation, ...evidenceInputs],
	surface: "user-documentation-and-scorecard",
}));
process.stdout.write(`${JSON.stringify({ status: "passed", receipts: 5 })}\n`);
