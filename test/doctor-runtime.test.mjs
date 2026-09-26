import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function fakeBinary(dir, name, output) {
	mkdirSync(dir, { recursive: true });
	const path = join(dir, name);
	writeFileSync(path, `#!/bin/sh\necho '${output}'\n`);
	chmodSync(path, 0o755);
	return path;
}

function withPath(pathDir, fn) {
	const original = process.env.PATH;
	process.env.PATH = pathDir;
	try {
		return fn();
	} finally {
		process.env.PATH = original;
	}
}

async function buildRuntime(pathDir) {
	const { createContext } = await import("../scripts/lazyantigravity-doctor/common.mjs");
	const { inspectRuntime } = await import("../scripts/lazyantigravity-doctor/runtime.mjs");
	return withPath(pathDir, () => inspectRuntime(createContext(root)));
}

test("#given a current lazyantigravity binary #when runtime is inspected #then the probe selects it", async () => {
	const dir = mkdtempSync(join(tmpdir(), "doctor-rt-"));
	fakeBinary(dir, "lazyantigravity", "[ulw-loop] Missing --file (path to claim-ledger.md)");

	const section = await buildRuntime(dir);
	const probe = section.capabilities.find((c) => c.capability === "ulw-loop research-claims");
	assert.equal(probe.selected, "lazyantigravity");
	const lazy = probe.results.find((r) => r.binary === "lazyantigravity");
	assert.equal(lazy.status, "supported");
	assert.equal(section.status, "pass");
});

test("#given a stale omo binary shadowed by a current lazyantigravity #when inspected #then a shadow warning is raised", async () => {
	const dir = mkdtempSync(join(tmpdir(), "doctor-rt-"));
	fakeBinary(dir, "lazyantigravity", "[ulw-loop] Missing --file (path to claim-ledger.md)");
	fakeBinary(dir, "omo", "Usage:\n  omo ulw-loop create-goals --brief ...");

	const section = await buildRuntime(dir);
	const probe = section.capabilities.find((c) => c.capability === "ulw-loop research-claims");
	assert.equal(probe.selected, "lazyantigravity");
	const omo = probe.results.find((r) => r.binary === "omo");
	assert.equal(omo.status, "unsupported_subcommand");
	assert.equal(section.status, "warn");
	assert.ok(section.warnings.some((w) => w.code === "shadowed_stale_binary"));
});

test("#given only a stale omo binary #when inspected #then a stale-cli warning is raised", async () => {
	const dir = mkdtempSync(join(tmpdir(), "doctor-rt-"));
	fakeBinary(dir, "omo", "Usage:\n  omo ulw-loop create-goals --brief ...");

	const section = await buildRuntime(dir);
	const probe = section.capabilities.find((c) => c.capability === "ulw-loop research-claims");
	assert.equal(probe.selected, null);
	assert.equal(section.status, "warn");
	assert.ok(section.warnings.some((w) => w.code === "stale_cli_binary"));
});

test("#given no CLI binary on PATH #when inspected #then a missing-cli warning is raised", async () => {
	const dir = mkdtempSync(join(tmpdir(), "doctor-rt-"));

	const section = await buildRuntime(dir);
	const probe = section.capabilities.find((c) => c.capability === "ulw-loop research-claims");
	assert.equal(probe.selected, null);
	assert.equal(section.status, "warn");
	assert.ok(section.warnings.some((w) => w.code === "missing_cli_binary"));
});
