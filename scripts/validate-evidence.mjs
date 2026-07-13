#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const STATUSES = new Set(["passed", "failed", "skipped", "unavailable", "stale"]);
const SNAPSHOT_KINDS = new Set(["baseline", "task-red", "final"]);
const REQUIRED = [
	"task", "surface", "capability", "snapshotKind", "subjectFiles", "subjectFingerprint",
	"workspaceFingerprint", "status", "command", "validatorRuntime", "publishedRuntime", "os",
	"startedAt", "finishedAt", "exitCode", "assertionIds", "artifactHashes",
];

function fail(code, message) {
	process.stderr.write(`[${code}] ${message}\n`);
	process.exit(1);
}

function normalizeRel(value) {
	if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes("\0")
		|| isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.startsWith("//")) {
		fail("evidence.subject.path", `invalid subject path: ${String(value)}`);
	}
	const parts = value.split("/");
	if (parts.some((part) => part === "" || part === "." || part === "..")) {
		fail("evidence.subject.path", `unsafe subject path: ${value}`);
	}
	return parts.join("/");
}

function arg(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? null : process.argv[index + 1];
}

const receiptPath = process.argv[2];
if (!receiptPath) fail("evidence.args", "receipt path is required");
const subjectRoot = arg("--subject-root");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
for (const key of REQUIRED) {
	if (!(key in receipt)) fail("evidence.schema.required", `missing ${key}`);
}
if (!SNAPSHOT_KINDS.has(receipt.snapshotKind)) fail("evidence.schema.snapshotKind", String(receipt.snapshotKind));
if (!STATUSES.has(receipt.status)) fail("evidence.schema.status", String(receipt.status));
if (!Array.isArray(receipt.subjectFiles)) fail("evidence.subject.files", "subjectFiles must be an array");
const subjectFiles = receipt.subjectFiles.map(normalizeRel);
if (JSON.stringify(subjectFiles) !== JSON.stringify([...subjectFiles].sort())) {
	fail("evidence.subject.sorted", "subjectFiles must be sorted");
}
if (new Set(subjectFiles).size !== subjectFiles.length) fail("evidence.subject.unique", "subjectFiles must be unique");

if (subjectRoot) {
	const hashes = {};
	for (const relPath of subjectFiles) {
		const absolute = join(subjectRoot, ...relPath.split("/"));
		if (!existsSync(absolute)) fail("evidence.subject.stale", `${relPath} is missing`);
		hashes[relPath] = sha256(readFileSync(absolute));
		if (receipt.artifactHashes?.[relPath] && receipt.artifactHashes[relPath] !== hashes[relPath]) {
			fail("evidence.subject.stale", `${relPath} hash changed`);
		}
	}
	const actualSubjectFingerprint = sha256(JSON.stringify(subjectFiles.map((relPath) => [relPath, hashes[relPath]])));
	if (actualSubjectFingerprint !== receipt.subjectFingerprint) {
		fail("evidence.subject.stale", `subject fingerprint changed: ${actualSubjectFingerprint}`);
	}
}

process.stdout.write(`${JSON.stringify({ status: "passed", receiptPath, subjectFiles }, null, 2)}\n`);
