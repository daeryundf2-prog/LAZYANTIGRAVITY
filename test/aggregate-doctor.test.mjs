import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

const requiredSections = ["manifests", "hooks", "mcp", "skills", "bundles", "versions", "warnings"];

test("#given aggregate plugin readiness #when doctor emits JSON #then required sections are present and non-failing", () => {
	const report = readDoctorReport();

	assert.equal(report.product?.name, "LazyAntigravity");
	for (const section of requiredSections) {
		assert.ok(Object.hasOwn(report, section), `doctor report is missing ${section}`);
	}

	const failingSections = requiredSections.filter((section) => report[section]?.status === "fail");
	assert.deepEqual(failingSections, []);
});

test("#given malformed doctor input #when an unsupported option is supplied #then the command rejects it", () => {
	const result = spawnSync(process.execPath, ["scripts/lazyantigravity-doctor.mjs", "--definitely-not-a-real-option"], {
		cwd: root,
		encoding: "utf8",
	});

	assert.notEqual(result.status, 0);
	assert.match(`${result.stderr}\n${result.stdout}`, /unknown argument/i);
});

test("#given package and plugin version drift #when building doctor report #then version section status is fail", async () => {
	const { buildDoctorReport } = await import("../scripts/lazyantigravity-doctor/report.mjs");
	const { mkdtemp, writeFile, mkdir } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");

	const mockRoot = await mkdtemp(join(tmpdir(), "doctor-version-drift-"));
	await writeFile(join(mockRoot, "package.json"), JSON.stringify({ name: "lazyantigravity", version: "0.1.0" }));
	await writeFile(join(mockRoot, "plugin.json"), JSON.stringify({
		name: "lazyantigravity",
		version: "0.3.0",
		hooks: "./hooks.json",
		mcpServers: "./mcp_config.json",
		skills: "./skills/",
	}));

	await writeFile(join(mockRoot, "hooks.json"), JSON.stringify({ hooks: {} }));
	await mkdir(join(mockRoot, "hooks"));
	await writeFile(join(mockRoot, "hooks", "hooks.json"), JSON.stringify({ hooks: {} }));
	await writeFile(join(mockRoot, ".mcp.json"), JSON.stringify({}));
	await writeFile(join(mockRoot, "mcp_config.json"), JSON.stringify({}));
	await mkdir(join(mockRoot, "skills"));
	await mkdir(join(mockRoot, "components"));

	const report = await buildDoctorReport(mockRoot);
	assert.equal(report.versions.status, "fail");
	assert.equal(report.status, "fail");
	assert.equal(report.versions.failures[0].code, "package_plugin_version_drift");
});

function readDoctorReport() {
	const result = spawnSync(process.execPath, ["scripts/lazyantigravity-doctor.mjs", "--json"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	return JSON.parse(result.stdout);
}
