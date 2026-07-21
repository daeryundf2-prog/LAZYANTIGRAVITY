#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const EXCLUDED = new Set([".git", "node_modules"]);
const EXCLUDED_PREFIXES = [".omo/evidence"];
const BASELINE_ROUTINE_SHA256 = "327e4eacf0a262e2a5169023fc88c711a1ff0e01683e8150eb19323c9736f91f";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fail(code, message) {
	process.stderr.write(`[${code}] ${message}\n`);
	process.exit(1);
}

function arg(name, fallback = null) {
	const index = process.argv.indexOf(name);
	return index === -1 ? fallback : process.argv[index + 1];
}

function normalizeRel(value) {
	if (typeof value !== "string" || value.length === 0) fail("snapshot.path.invalid", `empty path: ${String(value)}`);
	if (value.includes("\\") || value.includes("\0")) fail("snapshot.path.invalid", `non-normal path: ${value}`);
	if (isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.startsWith("//")) fail("snapshot.path.invalid", `absolute path: ${value}`);
	const parts = value.split("/");
	if (parts.some((part) => part === "" || part === "." || part === "..")) fail("snapshot.path.invalid", `unsafe path: ${value}`);
	return parts.join("/");
}

function excluded(relPath) {
	return EXCLUDED.has(relPath) || [...EXCLUDED].some((entry) => relPath.startsWith(`${entry}/`))
		|| EXCLUDED_PREFIXES.some((entry) => relPath === entry || relPath.startsWith(`${entry}/`));
}

function within(parent, child) {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function checkedPath(subjectRootReal, subjectRoot, relPath) {
	const parts = relPath.split("/");
	let current = subjectRoot;
	for (const part of parts) {
		current = join(current, part);
		const stat = lstatSync(current);
		if (stat.isSymbolicLink()) fail("snapshot.path.reparse", `${relPath} contains a symlink or junction`);
		if (stat.isSocket?.() || stat.isFIFO?.() || stat.isCharacterDevice?.() || stat.isBlockDevice?.()) {
			fail("snapshot.path.special", `${relPath} contains a special file`);
		}
		const resolved = realpathSync(current);
		if (!within(subjectRootReal, resolved)) fail("snapshot.path.escape", `${relPath} escapes subject root`);
	}
	return current;
}

function addPath(state, relPath) {
	const normalized = normalizeRel(relPath);
	if (excluded(normalized)) return;
	const lower = normalized.toLowerCase();
	if (state.caseSeen.has(lower) && state.caseSeen.get(lower) !== normalized) {
		fail("snapshot.path.case-collision", `${state.caseSeen.get(lower)} collides with ${normalized}`);
	}
	state.caseSeen.set(lower, normalized);
	state.paths.add(normalized);
}

function collectDirectory(state, subjectRootReal, subjectRoot, relDir) {
	const absolute = checkedPath(subjectRootReal, subjectRoot, relDir);
	const stat = lstatSync(absolute);
	if (!stat.isDirectory()) fail("snapshot.path.invalid", `${relDir} is not a directory`);
	for (const entry of readdirSync(absolute, { withFileTypes: true })) {
		const childRel = `${relDir}/${entry.name}`;
		const normalized = normalizeRel(childRel);
		if (excluded(normalized)) continue;
		const childAbs = checkedPath(subjectRootReal, subjectRoot, normalized);
		const childStat = lstatSync(childAbs);
		if (childStat.isDirectory()) collectDirectory(state, subjectRootReal, subjectRoot, normalized);
		else if (childStat.isFile()) addPath(state, normalized);
		else fail("snapshot.path.special", `${normalized} is not a regular file`);
	}
}

function gitStatus(subjectRoot) {
	const result = spawnSync("git", ["-C", subjectRoot, "status", "--porcelain=v1", "-z"], { encoding: "buffer", windowsHide: true });
	if (result.status !== 0 || result.error) return { available: false, entries: [] };
	return {
		available: true,
		entries: result.stdout.toString("utf8").split("\0").filter(Boolean).sort(),
	};
}

function assertBaselineRoutine(expected) {
	const preservedPath = join(root, "scripts", "toolchain", "preserved-baseline-snapshot.mjs");
	const actual = sha256(readFileSync(preservedPath));
	if (actual !== expected) fail("snapshot.routine.hash", `preserved baseline routine hash mismatch: ${actual}`);
	return { path: "scripts/toolchain/preserved-baseline-snapshot.mjs", sha256: actual };
}

const subjectRoot = resolve(arg("--subject-root") ?? fail("snapshot.args", "--subject-root is required"));
const destination = resolve(arg("--destination") ?? fail("snapshot.args", "--destination is required"));
const manifestPath = resolve(arg("--manifest") ?? fail("snapshot.args", "--manifest is required"));
const snapshotKind = arg("--snapshot-kind", "final");
const expectedRoutineSha = arg("--expected-routine-sha", BASELINE_ROUTINE_SHA256);
const startedAt = new Date().toISOString();
const subjectRootReal = realpathSync(subjectRoot);
const destinationParentReal = realpathSync(dirname(destination));
if (!within(destinationParentReal, destination)) fail("snapshot.destination.escape", "destination escapes its parent");

const routine = assertBaselineRoutine(expectedRoutineSha);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const state = { paths: new Set(), caseSeen: new Map() };
for (const filePath of manifest.files ?? []) {
	const normalized = normalizeRel(filePath);
	const absolute = checkedPath(subjectRootReal, subjectRoot, normalized);
	if (!lstatSync(absolute).isFile()) fail("snapshot.path.invalid", `${normalized} is not a regular file`);
	addPath(state, normalized);
}
for (const dirPath of manifest.directories ?? []) {
	const normalized = normalizeRel(dirPath);
	if (!excluded(normalized)) collectDirectory(state, subjectRootReal, subjectRoot, normalized);
}

const subjectFiles = [...state.paths].sort();
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
const artifactHashes = {};
for (const relPath of subjectFiles) {
	const from = checkedPath(subjectRootReal, subjectRoot, relPath);
	const to = join(destination, ...relPath.split("/"));
	mkdirSync(dirname(to), { recursive: true });
	const bytes = readFileSync(from);
	copyFileSync(from, to);
	artifactHashes[relPath] = sha256(bytes);
}

const subjectFingerprint = sha256(JSON.stringify(subjectFiles.map((relPath) => [relPath, artifactHashes[relPath]])));
const status = gitStatus(subjectRoot);
const workspaceFingerprint = sha256(JSON.stringify({ subjectFingerprint, gitStatus: status.entries }));
process.stdout.write(`${JSON.stringify({
	schemaVersion: 1,
	task: "workspace-snapshot",
	surface: "toolchain",
	capability: "dependency-free-snapshot",
	snapshotKind,
	subjectFiles,
	subjectFingerprint,
	workspaceFingerprint,
	status: "passed",
	command: `node scripts/build-workspace-snapshot.mjs --subject-root ${subjectRoot} --destination ${destination} --manifest ${manifestPath}`,
	validatorRuntime: { version: process.version, executable: process.execPath },
	publishedRuntime: { version: process.version, executable: process.execPath },
	os: { platform: platform(), arch: arch(), release: release() },
	startedAt,
	finishedAt: new Date().toISOString(),
	exitCode: 0,
	assertionIds: ["snapshot.paths-normalized", "snapshot.no-dereference", "snapshot.hashes-cover-bytes", "snapshot.git-status-manifest"],
	artifactHashes,
	gitStatus: status,
	baselineRoutine: routine,
}, null, 2)}\n`);
