#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { delimiter, dirname, normalize } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fail(code, message) {
	process.stderr.write(`[${code}] ${message}\n`);
	process.exit(1);
}

function parseVersion(version) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
	if (!match) fail("preflight.runtime.version", `unparseable Node version: ${version}`);
	return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function atLeast(version, minimum) {
	const actual = parseVersion(version);
	for (let index = 0; index < minimum.length; index += 1) {
		if (actual[index] > minimum[index]) return true;
		if (actual[index] < minimum[index]) return false;
	}
	return true;
}

function runtime(executable, version, probe) {
	let executableSha256 = null;
	try {
		executableSha256 = sha256(readFileSync(executable));
	} catch {
		executableSha256 = null;
	}
	return {
		version,
		executable,
		executableSha256,
		executablePathStringSha256: sha256(executable),
		probe,
	};
}

const pathValue = process.env.PATH ?? "";
const pathEntries = pathValue.split(delimiter).filter((entry) => entry.length > 0);
const validatorNodeDir = dirname(process.execPath);
const firstPathEntry = pathEntries[0] ?? "";
if (normalize(firstPathEntry).toLowerCase() !== normalize(validatorNodeDir).toLowerCase()) {
	fail("preflight.runtime.published", "literal PATH node is not frozen to the validator Node directory");
}

if (!atLeast(process.version, [20, 17, 0])) {
	fail("preflight.runtime.validator", `validator Node must be >=20.17.0, got ${process.version}`);
}

const publishedProbe = spawnSync("node", ["-e", "process.stdout.write(JSON.stringify({version:process.version,executable:process.execPath}))"], {
	encoding: "utf8",
	env: process.env,
	windowsHide: true,
});
if (publishedProbe.status !== 0 || publishedProbe.error) {
	fail("preflight.runtime.published", publishedProbe.error?.message ?? publishedProbe.stderr);
}

const published = JSON.parse(publishedProbe.stdout);
if (!atLeast(published.version, [20, 17, 0])) {
	fail("preflight.runtime.published", `literal PATH node must be >=20.17.0, got ${published.version}`);
}

process.stdout.write(`${JSON.stringify({
	schemaVersion: 1,
	validatorRuntime: runtime(process.execPath, process.version, "process.execPath"),
	publishedRuntime: runtime(published.executable, published.version, "literal PATH node"),
	executionEnvironment: {
		pathFrozen: true,
		pathSha256: sha256(pathValue),
		pathEntryCount: pathEntries.length,
		parentPathStringSha256: sha256(pathValue),
	},
	os: { platform: platform(), arch: arch(), release: release() },
}, null, 2)}\n`);
