#!/usr/bin/env node
import { createHash } from "node:crypto";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = ".omo/evidence/task-18-local-score-evidence.json";
const jsonPath = "docs/scorecard.json";
const markdownPath = "docs/scorecard.md";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const generatorSha256 = () => sha256(readFileSync(join(root, "scripts/generate-antigravity-score.mjs")));

function fail(message) {
	throw new Error(message);
}

function receiptCurrent(receipt) {
	if (receipt.snapshotKind !== "final") return false;
	const files = receipt.subjectFiles;
	if (!Array.isArray(files) || JSON.stringify(files) !== JSON.stringify([...files].sort())) return false;
	const hashes = {};
	for (const path of files) {
		if (!existsSync(join(root, path))) return false;
		hashes[path] = sha256(readFileSync(join(root, path)));
		if (receipt.artifactHashes?.[path] !== hashes[path]) return false;
	}
	return receipt.subjectFingerprint === sha256(JSON.stringify(files.map((path) => [path, hashes[path]])));
}

function exactReceiptPaths(rubric) {
	return [...new Set(rubric.categories.flatMap(({ items }) => items.map(({ receipt }) => receipt)))]
		.filter((path) => path !== evidencePath)
		.sort();
}

function verifyBilingualTruth() {
	const catalog = readJson("config/antigravity-skills.json");
	const modes = readJson("config/experimental-skill-modes.json");
	const english = readFileSync(join(root, "docs/experimental-skills.md"), "utf8");
	const korean = readFileSync(join(root, "docs/experimental-skills.ko.md"), "utf8");
	const expected = catalog.experimental.map(({ name }) => name);
	const names = [english, korean].map((text) => [...text.matchAll(/<!-- skill:([^ ]+) -->/g)].map((match) => match[1]));
	if (expected.length !== 19 || JSON.stringify(names[0]) !== JSON.stringify(expected) || JSON.stringify(names[1]) !== JSON.stringify(expected)) {
		fail("bilingual experimental-skill rows do not match the exact 19-skill catalog");
	}
	for (const name of expected) {
		if (JSON.stringify(modes[name]) !== JSON.stringify({ ide: "unsupported", cli: "unsupported" })) {
			fail(`experimental skill is not unsupported in both modes: ${name}`);
		}
	}
	const userDocs = ["README.md", "src/README.md", "src/README.ko.md", "CHANGELOG.md"]
		.map((path) => readFileSync(join(root, path), "utf8")).join("\n");
	if (!/15 active skills/.test(userDocs) || !/real SQLite.*unavailable/is.test(userDocs) || !/not proven for live installation or production deployment/i.test(userDocs)) {
		fail("user documentation does not preserve the verified inventory and unavailable boundaries");
	}
}

function refreshEvidence() {
	const rubric = readJson("config/score-rubric.json");
	verifyBilingualTruth();
	const receiptPaths = exactReceiptPaths(rubric);
	for (const path of receiptPaths) {
		if (!existsSync(join(root, path))) fail(`required capability receipt is missing: ${path}`);
	}
	const sourceFiles = [
		...receiptPaths,
		"CHANGELOG.md",
		"README.md",
		"config/antigravity-skills.json",
		"config/experimental-skill-modes.json",
		"config/score-rubric.json",
		"docs/experimental-skills.ko.md",
		"docs/experimental-skills.md",
		"scripts/generate-antigravity-score.mjs",
		"src/README.ko.md",
		"src/README.md",
	].sort();
	const startedAt = new Date().toISOString();
	const assertionIds = ["score.bilingual-truth", "score.freshness"];
	const artifactHashes = Object.fromEntries(sourceFiles.map((path) => [path, sha256(readFileSync(join(root, path)))]));
	const subjectFingerprint = sha256(JSON.stringify(sourceFiles.map((path) => [path, artifactHashes[path]])));
	const receipt = {
		task: "18", surface: "evidence-backed-score", capability: "exact-capability-receipt-freshness-and-bilingual-truth",
		snapshotKind: "final", subjectFiles: sourceFiles, subjectFingerprint,
		workspaceFingerprint: sha256(JSON.stringify({ subjectFingerprint, assertionIds })), status: "passed",
		verificationLevel: "contract-tested", liveStatus: "unavailable",
		command: "node scripts/generate-antigravity-score.mjs --refresh-evidence",
		validatorRuntime: { version: process.version, executable: process.execPath },
		publishedRuntime: { version: process.version, executable: process.execPath },
		os: { platform: platform(), arch: arch() }, startedAt, finishedAt: new Date().toISOString(), exitCode: 0,
		assertionIds, artifactHashes,
	};
	mkdirSync(join(root, ".omo/evidence"), { recursive: true });
	writeFileSync(join(root, evidencePath), `${JSON.stringify(receipt, null, 2)}\n`);
}

function evaluateItem(category, item) {
	const base = { category, id: item.id, points: item.points };
	if (!existsSync(join(root, item.receipt))) {
		return { ...base, earnedPoints: 0, status: "unavailable", evidence: null, reason: item.unavailableReason ?? "exact capability receipt is missing" };
	}
	const receipt = readJson(item.receipt);
	if (item.localEvidenceEligible === false) {
		return { ...base, earnedPoints: 0, status: "unavailable", evidence: null, reason: item.unavailableReason ?? "local evidence cannot earn this capability" };
	}
	if (receipt.status !== "passed") {
		return { ...base, earnedPoints: 0, status: receipt.status, evidence: null, reason: item.unavailableReason ?? `exact capability receipt status is ${receipt.status}` };
	}
	if (!receiptCurrent(receipt)) {
		return { ...base, earnedPoints: 0, status: "stale", evidence: null, reason: "exact capability receipt is stale" };
	}
	const assertions = new Set(receipt.assertionIds ?? []);
	const missing = item.assertionIds.filter((id) => !assertions.has(id));
	if (missing.length > 0) {
		return { ...base, earnedPoints: 0, status: "unavailable", evidence: null, reason: item.unavailableReason ?? `exact passed assertions are missing: ${missing.join(", ")}` };
	}
	return { ...base, earnedPoints: item.points, status: "passed", evidence: item.receipt, reason: "fresh passed exact capability receipt" };
}

function buildScore() {
	const rubric = readJson("config/score-rubric.json");
	const items = rubric.categories.flatMap(({ id, items: categoryItems }) => categoryItems.map((item) => evaluateItem(id, item)));
	const scoreEvidence = readJson(evidencePath);
	return {
		schemaVersion: 2, rubric: "config/score-rubric.json", totalPoints: rubric.totalPoints,
		earnedPoints: items.reduce((sum, item) => sum + item.earnedPoints, 0),
		availabilityCeiling: items.filter((item) => item.status !== "unavailable").reduce((sum, item) => sum + item.points, 0),
		awardRule: rubric.awardRule, assertionMode: rubric.assertionMode,
		provenance: {
			evidenceMode: "frozen-checked-in",
			generatorSha256: generatorSha256(),
			sourceEvidenceDigest: scoreEvidence.subjectFingerprint,
		},
		liveValidation: { hostedMatrix: "unavailable", cli: "unavailable", ide: "unavailable", realSqlite: "unavailable" },
		items: items.map((item) => item.status === "passed"
			? { ...item, reason: "passed in source evidence snapshot" }
			: item),
	};
}

function validateFrozenScore(score) {
	const rubric = readJson("config/score-rubric.json");
	if (score.schemaVersion !== 2 || score.rubric !== "config/score-rubric.json") fail("frozen scorecard schema or rubric path is invalid");
	if (score.totalPoints !== rubric.totalPoints || score.awardRule !== rubric.awardRule || score.assertionMode !== rubric.assertionMode) {
		fail("frozen scorecard does not match the exact rubric contract");
	}
	if (score.provenance?.evidenceMode !== "frozen-checked-in") fail("frozen scorecard evidence mode is invalid");
	if (score.provenance.generatorSha256 !== generatorSha256()) fail("frozen scorecard generator provenance is stale");
	if (!/^[a-f0-9]{64}$/.test(score.provenance.sourceEvidenceDigest ?? "")) fail("frozen scorecard source evidence digest is invalid");
	const expectedItems = rubric.categories.flatMap(({ id: category, items }) => items.map((item) => ({ category, ...item })));
	if (!Array.isArray(score.items) || score.items.length !== expectedItems.length) fail("frozen scorecard item count does not match the rubric");
	for (let index = 0; index < expectedItems.length; index += 1) {
		const expected = expectedItems[index];
		const actual = score.items[index];
		if (actual.category !== expected.category || actual.id !== expected.id || actual.points !== expected.points) {
			fail(`frozen scorecard rubric item mismatch at index ${index}`);
		}
		if (!Number.isInteger(actual.earnedPoints) || actual.earnedPoints < 0 || actual.earnedPoints > actual.points) {
			fail(`frozen scorecard points are invalid: ${actual.id}`);
		}
		if (actual.status === "passed") {
			if (actual.earnedPoints !== actual.points || actual.evidence !== expected.receipt || actual.reason !== "passed in source evidence snapshot") {
				fail(`frozen passed item is internally inconsistent: ${actual.id}`);
			}
		} else if (["unavailable", "failed", "skipped", "stale"].includes(actual.status)) {
			if (actual.earnedPoints !== 0 || actual.evidence !== null) fail(`frozen non-passed item earned points: ${actual.id}`);
		} else {
			fail(`frozen scorecard status is invalid: ${actual.id}`);
		}
	}
	for (const id of ["sqlite-safe-readonly", "hosted-matrix", "cli-install-list-live", "ide-live"]) {
		const item = score.items.find((candidate) => candidate.id === id);
		if (item?.status !== "unavailable" || item.earnedPoints !== 0 || item.evidence !== null) fail(`required unavailable boundary drift: ${id}`);
	}
	const earnedPoints = score.items.reduce((sum, item) => sum + item.earnedPoints, 0);
	const availabilityCeiling = score.items.filter((item) => item.status !== "unavailable").reduce((sum, item) => sum + item.points, 0);
	if (score.earnedPoints !== earnedPoints || score.availabilityCeiling !== availabilityCeiling) fail("frozen scorecard totals are internally inconsistent");
	if (JSON.stringify(score.liveValidation) !== JSON.stringify({ hostedMatrix: "unavailable", cli: "unavailable", ide: "unavailable", realSqlite: "unavailable" })) {
		fail("frozen scorecard live-validation boundary drift");
	}
}

function renderMarkdown(score) {
	const rows = score.items.map((item) => `| ${item.category} | ${item.id} | ${item.earnedPoints} / ${item.points} | ${item.status} | ${item.reason} |`).join("\n");
	return `# LAZYANTIGRAVITY evidence-backed scorecard\n\n**Evidence-backed score: ${score.earnedPoints} / ${score.totalPoints}**\n\n**Evidence mode: \`frozen-checked-in\`.** This is a checked-in snapshot derived from source evidence digest \`${score.provenance.sourceEvidenceDigest}\`; it does not claim that ignored local receipts are present or fresh in this checkout. In a release workspace where \`.omo/evidence\` is present, the generator revalidates final receipt freshness and exact current subjects before accepting these values.\n\nReal SQLite, GitHub-hosted matrix execution, CLI live install/list, and IDE live inspection are unavailable in the source evidence and earn 0. Local substitutes do not earn those points.\n\n| Category | Item | Score | Status | Evidence result |\n|---|---|---:|---|---|\n${rows}\n\n## Usability verdict\n\n**Usable for local evaluation and staged process verification, not proven for live installation or production deployment.** The 15 active skills, 2 official hooks, and 3 local MCP servers were exercised in staged layouts. Four layouts were byte-identical, but IDE rule parity remains unverified.\n`;
}

function writeOrCheck(path, content, check) {
	const absolute = join(root, path);
	if (check) {
		if (!existsSync(absolute) || readFileSync(absolute, "utf8") !== content) fail(`generated file drift: ${path}`);
	} else {
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, content);
	}
}

const check = process.argv.includes("--check");
const refresh = process.argv.includes("--refresh-evidence");
if (refresh) refreshEvidence();
const localEvidencePresent = existsSync(join(root, ".omo/evidence"));
if (!localEvidencePresent && !check) fail("ignored local evidence is required to regenerate the scorecard");
const evidenceMode = localEvidencePresent ? "fresh-local-receipts" : "frozen-checked-in";
const score = localEvidencePresent ? buildScore() : readJson(jsonPath);
if (!localEvidencePresent) validateFrozenScore(score);
writeOrCheck(jsonPath, `${JSON.stringify(score, null, 2)}\n`, check);
writeOrCheck(markdownPath, renderMarkdown(score), check);
process.stdout.write(`${JSON.stringify({ status: "passed", evidenceMode, earnedPoints: score.earnedPoints, totalPoints: score.totalPoints })}\n`);
