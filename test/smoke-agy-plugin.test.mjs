import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, parse, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildChildEnvironment, cleanupIsolatedRoot, prepareIsolatedRoot } from "../scripts/live-probes/environment.mjs";
import { runBounded, terminateOwnedProcess } from "../scripts/live-probes/process.mjs";
import { loadPublishedRuntime } from "../scripts/live-probes/receipt.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smoke = join(root, "scripts", "smoke-agy-plugin.mjs");

function writeRuntimeReceipt(path, executable = process.execPath, version = process.version) {
	writeFileSync(path, `${JSON.stringify({
		workspaceFingerprint: "0".repeat(64),
		validatorRuntime: { executable: process.execPath, version: process.version },
		publishedRuntime: { executable, version },
	})}\n`);
}

function fakeAgy(directory, mode = "happy") {
	mkdirSync(directory, { recursive: true });
	const implementation = join(directory, "fake-agy.mjs");
	writeFileSync(join(directory, "mode.txt"), mode);
	writeFileSync(implementation, `
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const mode = readFileSync(new URL("./mode.txt", import.meta.url), "utf8").trim();
const [group, action, value] = process.argv.slice(2);
if (group !== "plugin" || !["install", "list", "uninstall"].includes(action)) process.exit(31);
if (mode === "hang" && action === "install") setInterval(() => {}, 1000);
if (mode === "fail" && action === "install") process.exit(19);
if (mode === "write-real" && action === "install") {
  const target = readFileSync(new URL("./real-root.txt", import.meta.url), "utf8").trim();
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "mutated.txt"), "changed");
}
const state = join(process.env.HOME, "agy-state", "lazyantigravity");
if (action === "install") { mkdirSync(dirname(state), { recursive: true }); writeFileSync(state, value); }
if (action === "list") process.stdout.write(existsSync(state) ? "lazyantigravity\\n" : "");
if (action === "uninstall") rmSync(state, { force: true });
`);
	if (process.platform === "win32") {
		const wrapper = join(directory, "agy.cmd");
		writeFileSync(wrapper, `@echo off\r\nnode "${implementation}" %*\r\n`);
		return wrapper;
	}
	const wrapper = join(directory, "agy");
	writeFileSync(wrapper, `#!/bin/sh\nexec node "${implementation}" "$@"\n`, { mode: 0o755 });
	return wrapper;
}

function invoke(options = {}) {
	const temp = mkdtempSync(join(tmpdir(), "todo16 smoke with spaces "));
	const receipt = join(temp, "runtime.json");
	const output = join(temp, "probe.json");
	const isolated = join(temp, "isolated profile");
	const realRoot = join(temp, "real product root");
	mkdirSync(realRoot, { recursive: true });
	writeFileSync(join(realRoot, "canary.txt"), "stable");
	writeRuntimeReceipt(receipt, options.runtimeExecutable, options.runtimeVersion);
	options.prepare?.({ isolated, realRoot });
	const args = [smoke, "--runtime-receipt", receipt, "--plugin-root", root, "--receipt", output,
		"--isolated-root", isolated, "--real-root", realRoot, "--timeout-ms", String(options.timeoutMs ?? 500)];
	if (options.agy) args.push("--agy", options.agy);
	if (options.auth !== false) args.push("--auth-provisioned");
	const result = spawnSync(process.execPath, args, {
		encoding: "utf8",
		env: { ...process.env, PATH: dirname(process.execPath) },
		timeout: 60_000,
	});
	return { temp, output, isolated, realRoot, result };
}

test("[todo16.cli.env] Given a parent environment When child isolation is built Then every home and temp variable is redirected without mutating parent PATH", () => {
	const isolated = resolve(tmpdir(), "todo16 isolated env");
	const parentPath = process.env.PATH;
	const env = buildChildEnvironment({ isolatedRoot: isolated, publishedRuntime: process.execPath, agyExecutable: null });
	for (const name of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "XDG_RUNTIME_DIR", "TMP", "TEMP"]) {
		assert.equal(resolve(env[name]), isolated);
	}
	if (process.platform === "win32") assert.equal(resolve(`${env.HOMEDRIVE}${env.HOMEPATH}`), isolated);
	assert.equal(process.env.PATH, parentPath);
	assert.equal(env.PATH.split(delimiter)[0], dirname(process.execPath));
	assert.deepEqual(env.PATH.split(delimiter), [dirname(process.execPath)]);
	assert.equal(env.PATH.includes("node_modules"), false);
});

test("[todo16.cli.ownership] Given an arbitrary or pre-populated path When isolation is prepared Then it is rejected without deletion", () => {
	assert.throws(() => prepareIsolatedRoot(homedir()), /temporary directory|owned/i);
	const nonempty = mkdtempSync(join(tmpdir(), "todo16 nonempty root "));
	try {
		writeFileSync(join(nonempty, "canary.txt"), "stable");
		assert.throws(() => prepareIsolatedRoot(nonempty), /empty|owned/i);
		assert.equal(readFileSync(join(nonempty, "canary.txt"), "utf8"), "stable");
	} finally { rmSync(nonempty, { recursive: true, force: true }); }
});

test("[todo16.cli.ownership-junction] Given an isolated path below a symlink or junction When prepared Then canonical escape is rejected", (t) => {
	const fixture = mkdtempSync(join(tmpdir(), "todo16 junction fixture "));
	const target = mkdtempSync(join(tmpdir(), "todo16 junction target "));
	const link = join(fixture, "escape");
	writeFileSync(join(target, "canary.txt"), "stable");
	let ownership = null;
	try {
		try { symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir"); }
		catch (error) { t.skip(`junction unavailable: ${error.code ?? error.message}`); return; }
		assert.throws(() => { ownership = prepareIsolatedRoot(join(link, "isolated")); }, /reparse|symlink|canonical|temporary/i);
		assert.equal(readFileSync(join(target, "canary.txt"), "utf8"), "stable");
	} finally {
		if (ownership !== null) cleanupIsolatedRoot(ownership);
		rmSync(fixture, { recursive: true, force: true });
		rmSync(target, { recursive: true, force: true });
	}
});

test("[todo16.cli.invalid-receipt-cleanup] Given an invalid runtime receipt and default isolation When startup fails Then no implicit root is created", () => {
	const temp = mkdtempSync(join(tmpdir(), "todo16 invalid receipt "));
	const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("lazyantigravity todo16 cli ")));
	try {
		const result = spawnSync(process.execPath, [smoke, "--runtime-receipt", join(temp, "missing.json"), "--receipt", join(temp, "out.json")], {
			encoding: "utf8",
			env: { ...process.env, PATH: dirname(process.execPath) },
		});
		assert.notEqual(result.status, 0);
		const after = readdirSync(tmpdir()).filter((name) => name.startsWith("lazyantigravity todo16 cli "));
		assert.deepEqual(after.filter((name) => !before.has(name)), []);
	} finally { rmSync(temp, { recursive: true, force: true }); }
});

test("[todo16.cli.happy] Given a provisioned mock CLI When install/list/uninstall runs Then only the documented live capability passes and real roots stay stable", () => {
	const binRoot = mkdtempSync(join(tmpdir(), "todo16 agy bin "));
	const agy = fakeAgy(binRoot);
	const implicitBefore = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("lazyantigravity todo16 cli ")));
	const run = invoke({ agy });
	try {
		assert.equal(run.result.status, 0, `${run.result.stderr}\n${run.result.stdout}`);
		const receipt = JSON.parse(readFileSync(run.output, "utf8"));
		assert.equal(receipt.status, "passed");
		assert.equal(receipt.liveStatus, "passed");
		assert.equal(receipt.verificationLevel, "live-verified");
		assert.equal(readFileSync(join(run.realRoot, "canary.txt"), "utf8"), "stable");
		assert.equal(readFileSync(join(binRoot, "mode.txt"), "utf8"), "happy");
		assert.equal(basename(agy).startsWith("agy"), true);
		assert.equal(run.result.stdout.includes("hook"), false);
		assert.equal(run.result.stdout.includes("mcp"), false);
		assert.equal(run.result.error, undefined);
		assert.equal(existsSync(run.isolated), false);
		const implicitAfter = readdirSync(tmpdir()).filter((name) => name.startsWith("lazyantigravity todo16 cli "));
		assert.deepEqual(implicitAfter.filter((name) => !implicitBefore.has(name)), []);
	} finally {
		rmSync(run.temp, { recursive: true, force: true });
		rmSync(binRoot, { recursive: true, force: true });
	}
});

test("[todo16.cli.unavailable] Given no provisioned agy binary When probed Then status is unavailable with exit 77 and zero live proof", () => {
	const run = invoke({ auth: true });
	try {
		assert.equal(run.result.status, 77, run.result.stderr);
		const receipt = JSON.parse(readFileSync(run.output, "utf8"));
		assert.equal(receipt.status, "unavailable");
		assert.equal(receipt.liveStatus, "unavailable");
		assert.equal(receipt.verificationLevel, "contract-tested");
		assert.equal(existsSync(run.isolated), false);
	} finally { rmSync(run.temp, { recursive: true, force: true }); }
});

test("[todo16.cli.auth] Given a CLI without provisioned auth When probed Then status is deliberately skipped with exit 77", () => {
	const binRoot = mkdtempSync(join(tmpdir(), "todo16 auth agy "));
	const run = invoke({ agy: fakeAgy(binRoot), auth: false });
	try {
		assert.equal(run.result.status, 77, run.result.stderr);
		const receipt = JSON.parse(readFileSync(run.output, "utf8"));
		assert.equal(receipt.status, "skipped");
		assert.equal(receipt.liveStatus, "skipped");
		assert.equal(existsSync(run.isolated), false);
	} finally { rmSync(run.temp, { recursive: true, force: true }); rmSync(binRoot, { recursive: true, force: true }); }
});

for (const [mode, assertion] of [["fail", "todo16.cli.command-failed"], ["hang", "todo16.cli.timeout"], ["write-real", "todo16.cli.real-root-changed"]]) {
	test(`[${assertion}] Given a ${mode} CLI When probed Then it fails non-77 and cleans the isolated root`, () => {
		const binRoot = mkdtempSync(join(tmpdir(), `todo16 ${mode} agy `));
		const agy = fakeAgy(binRoot, mode);
		const run = invoke({
			agy,
			timeoutMs: 150,
			prepare: mode === "write-real" ? ({ realRoot }) => writeFileSync(join(binRoot, "real-root.txt"), realRoot) : undefined,
		});
		try {
			assert.equal(run.result.status, 1, run.result.stderr);
			assert.equal(JSON.parse(readFileSync(run.output, "utf8")).status, "failed");
			assert.equal(run.result.status === 77, false);
			assert.equal(existsSync(run.isolated), false);
		} finally { rmSync(run.temp, { recursive: true, force: true }); rmSync(binRoot, { recursive: true, force: true }); }
	});
}

test("[todo16.cli.runtime-mismatch] Given a recorded version mismatch When preflight runs Then product commands never run and exit is non-77", () => {
	const binRoot = mkdtempSync(join(tmpdir(), "todo16 mismatch agy "));
	const run = invoke({ agy: fakeAgy(binRoot), runtimeVersion: "v0.0.0" });
	try {
		assert.equal(run.result.status, 1, run.result.stderr);
		assert.equal(readFileSync(join(binRoot, "mode.txt"), "utf8"), "happy");
	} finally { rmSync(run.temp, { recursive: true, force: true }); rmSync(binRoot, { recursive: true, force: true }); }
});

test("[todo16.cli.runtime-receipt-no-authority] Given a crafted receipt points at a fake node When probed Then the fake runtime is never executed", () => {
	const fakeRoot = mkdtempSync(join(tmpdir(), "todo16 malicious runtime "));
	const marker = join(fakeRoot, "executed.txt");
	const fakeNode = join(fakeRoot, process.platform === "win32" ? "node.cmd" : "node");
	if (process.platform === "win32") {
		writeFileSync(fakeNode, `@echo off\r\n>"${marker}" echo executed\r\n"${process.execPath}" %*\r\n`);
	} else {
		writeFileSync(fakeNode, `#!/bin/sh\nprintf executed > "${marker}"\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
	}
	const run = invoke({ runtimeExecutable: fakeNode });
	try {
		const receipt = join(fakeRoot, "runtime.json");
		writeRuntimeReceipt(receipt, fakeNode);
		assert.throws(
			() => loadPublishedRuntime(receipt, { trustedRuntime: process.execPath }),
			/trusted runtime|receipt runtime/i,
		);
		assert.equal(run.result.status, 1, run.result.stderr);
		assert.equal(existsSync(marker), false, "untrusted receipt runtime executed before it was rejected");
	} finally {
		rmSync(run.temp, { recursive: true, force: true });
		rmSync(fakeRoot, { recursive: true, force: true });
	}
});

test("[todo16.cli.pid-reuse] Given process identity changes immediately before termination When cleanup runs Then it fails closed without any kill", async () => {
	const bound = Object.freeze({
		pid: 4242,
		parentPid: process.pid,
		executable: process.execPath,
		creationTime: "original",
		commandLine: "node original.mjs",
	});
	let killCalls = 0;
	const result = await terminateOwnedProcess(bound, {
		platform: "linux",
		inspect: () => ({ ...bound, creationTime: "reused", commandLine: "node attacker.mjs" }),
		kill: () => { killCalls += 1; },
	});
	assert.deepEqual(result, { ok: false, method: "identity-mismatch" });
	assert.equal(killCalls, 0);
});

test("[todo16.cli.output-bytes] Given multibyte output exceeds the cap When bounded Then retained UTF-8 is at most 64 KiB and remains valid", async () => {
	const result = await runBounded({
		executable: process.execPath,
		args: ["-e", "process.stdout.write('é'.repeat(40000))"],
		env: process.env,
		timeoutMs: 2_000,
	});
	assert.equal(result.status, "exited");
	assert.equal(Buffer.byteLength(result.stdout, "utf8") <= 64 * 1024, true);
	assert.equal(result.stdout.includes("�"), false);
});

test("[todo16.cli.cleanup-failure] Given a timed-out PID whose cleanup reports failure When bounded execution returns Then the result is a non-77 cleanup failure", async () => {
	const result = await runBounded({ executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"], env: process.env, timeoutMs: 50 }, async (identity) => {
		process.kill(identity.pid, "SIGKILL");
		return { ok: false, method: "test-reported-cleanup-failure" };
	});
	assert.equal(result.status, "cleanup-failed");
	assert.equal(result.exitCode === 77, false);
});
