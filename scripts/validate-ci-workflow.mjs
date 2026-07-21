#!/usr/bin/env node
import { readFileSync } from "node:fs";

const EXACT = Object.freeze({
	focused: "node --test test/antigravity-plugin-contract.test.mjs test/antigravity-hook-contract.test.mjs test/antigravity-mcp-contract.test.mjs",
	full: "node scripts/run-tests.mjs",
	snapshot: "node --test test/antigravity-workspace-snapshot.test.mjs",
	staged: "node scripts/validate-antigravity-distribution.mjs --receipt .omo/evidence/ci-staged-report.json",
	sqlite: "node --test test/database-mcp-security.test.mjs",
});

const FULL_ACTION_SHA = /^[^\s/@]+\/[^\s@]+@[0-9a-f]{40}$/;
const VERSION_COMMENT = /[ \t]+# v\d+\.\d+\.\d+[ \t]*$/gm;

function fail(code, message) {
	throw new Error(`[ci.${code}] ${message}`);
}

function sameValues(actual, expected, label) {
	if (!Array.isArray(actual) || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
		fail("matrix", `${label} must be exact`);
	}
}

function steps(job, label) {
	if (!job || !Array.isArray(job.steps)) fail("jobs", `${label} steps missing`);
	return job.steps;
}

function namedRun(jobSteps, name) {
	return jobSteps.find((step) => step.name === name)?.run;
}

function assertUploads(jobSteps, label) {
	const upload = jobSteps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
	if (!upload || upload.if !== "${{ always() }}" || upload.with?.path !== ".omo/evidence") {
		fail("receipts", `${label} receipt upload missing`);
	}
}

function assertPinnedActions(value) {
	for (const [jobName, job] of Object.entries(value.jobs ?? {})) {
		for (const [index, step] of steps(job, jobName).entries()) {
			if (step.uses !== undefined && (typeof step.uses !== "string" || !FULL_ACTION_SHA.test(step.uses))) {
				fail("action-ref", `${jobName} step ${index + 1} must pin uses to a lowercase 40-hex commit SHA`);
			}
		}
	}
}

function inspectForbidden(value) {
	const source = JSON.stringify(value);
	for (const [label, pattern] of [
		["install", /(?:npm|pnpm|yarn|bun|pip|choco|winget|apt(?:-get)?)\s+(?:ci|install|add)/i],
		["download", /\b(?:curl|wget|Invoke-WebRequest)\b/i],
		["secret", /\bsecrets\./i],
		["continue-on-error", /continue-on-error/i],
		["sign-in", /\b(?:login|signin|sign-in)\b/i],
		["remote extra", /LAZYANTIGRAVITY_(?:REMOTE|NETWORK)/i],
	]) {
		if (pattern.test(source)) fail("forbidden", `${label} is forbidden`);
	}
}

export function validateCiWorkflow(value) {
	if (!value || Array.isArray(value) || typeof value !== "object") fail("schema", "root must be an object");
	if (JSON.stringify(Object.keys(value.on ?? {}).sort()) !== JSON.stringify(["pull_request", "push", "workflow_dispatch"])) {
		fail("triggers", "exact push, pull_request, workflow_dispatch triggers required");
	}
	if (JSON.stringify(value.permissions) !== JSON.stringify({ contents: "read" })) fail("permissions", "contents read only");
	if (JSON.stringify(Object.keys(value.jobs ?? {}).sort()) !== JSON.stringify(["cli_live", "core", "real_sqlite"])) {
		fail("jobs", "exact jobs required");
	}
	inspectForbidden(value);
	assertPinnedActions(value);

	const core = value.jobs.core;
	if (core["runs-on"] !== "${{ matrix.os }}" || core.strategy?.["fail-fast"] !== false) fail("matrix", "core matrix runner invalid");
	sameValues(core.strategy?.matrix?.os, ["ubuntu-latest", "windows-latest"], "operating systems");
	sameValues(core.strategy?.matrix?.node, ["20", "22"], "Node versions");
	const coreSteps = steps(core, "core");
	for (const [name, command] of [["Focused contracts", EXACT.focused], ["Full regression", EXACT.full], ["Workspace snapshot", EXACT.snapshot], ["Staged distribution", EXACT.staged]]) {
		if (namedRun(coreSteps, name) !== command) fail("commands", `${name} command changed`);
	}
	assertUploads(coreSteps, "core");

	const sqlite = value.jobs.real_sqlite;
	if (sqlite?.["runs-on"] !== "ubuntu-latest" || sqlite.env?.LAZYANTIGRAVITY_REQUIRE_REAL_SQLITE !== "1") {
		fail("sqlite", "Ubuntu Node 22 SQLite gate must fail closed");
	}
	const sqliteSteps = steps(sqlite, "real_sqlite");
	if (sqliteSteps.find((step) => step.uses?.startsWith("actions/setup-node@"))?.with?.["node-version"] !== "22") fail("sqlite", "Node 22 required");
	if (namedRun(sqliteSteps, "Real SQLite fail-closed gate") !== EXACT.sqlite) fail("sqlite", "real SQLite command changed");
	assertUploads(sqliteSteps, "real_sqlite");

	const liveSteps = steps(value.jobs.cli_live, "cli_live");
	if (value.jobs.cli_live["runs-on"] !== "ubuntu-latest") fail("live", "CLI live job must use Ubuntu");
	const provision = namedRun(liveSteps, "Provision runtime receipt") ?? "";
	for (const token of [
		"const runtime={version:process.version,executable:process.execPath}",
		"publishedRuntime:runtime",
		"validatorRuntime:runtime",
	]) {
		if (!provision.includes(token)) fail("runtime-receipt", `missing ${token}`);
	}
	const cli = namedRun(liveSteps, "CLI live status") ?? "";
	for (const token of ["code=$?", "c===77", "['unavailable','skipped']", "r.liveStatus!==r.status", "r.exitCode!==77", "else process.exit(c)"]) {
		if (!cli.includes(token)) fail("live-77", `missing ${token}`);
	}
	if (/c===77[^]*status\s*=\s*['\"]passed/i.test(cli) || /\|\|\s*(?:true|exit\s+0)/i.test(cli)) fail("live-77", "exit 77 cannot become passed");
	const ide = namedRun(liveSteps, "IDE remains unavailable") ?? "";
	for (const token of ["!==77", "r.status!=='unavailable'", "r.liveStatus!=='unavailable'"]) {
		if (!ide.includes(token)) fail("ide", "IDE must remain unavailable");
	}
	assertUploads(liveSteps, "cli_live");
	return Object.freeze({ status: "passed", combinations: 4, hostedMatrix: "unavailable" });
}

if (process.argv[1] && process.argv[1].endsWith("validate-ci-workflow.mjs")) {
	try {
		const path = process.argv[2];
		if (!path) fail("args", "workflow path required");
		const value = JSON.parse(readFileSync(path, "utf8").replace(VERSION_COMMENT, ""));
		process.stdout.write(`${JSON.stringify(validateCiWorkflow(value))}\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : "[ci.internal] validation failed";
		process.stderr.write(`${message.startsWith("[ci.") ? message : `[ci.parse] ${message}`}\n`);
		process.exitCode = 1;
	}
}
