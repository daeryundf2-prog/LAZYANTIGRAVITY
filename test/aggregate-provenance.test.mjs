import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

const runtimeRoots = ["ast-grep-mcp", "git-bash-mcp", "lsp-tools-mcp", "shared-skills"];

test("#given aggregate source-boundary surfaces #when provenance is reported #then every generated and vendored surface has an owner", async () => {
	const report = readProvenanceReport();
	const componentDistDirs = await findComponentDistDirs();

	assertSection(report, "generated");
	assertSection(report, "vendored_or_symlinked");
	assertSection(report, "source_roots");
	assertSection(report, "build_steps");
	assertSection(report, "dirty_state");
	assertSection(report, "component_packages");
	assertSection(report, "build_scripts");

	const generatedPaths = new Set(report.generated.map((entry) => entry.path));
	for (const distDir of componentDistDirs) {
		assert.equal(generatedPaths.has(distDir), true, `${distDir} is missing from provenance.generated`);
	}

	const componentPackagePaths = new Set(report.component_packages.map((entry) => entry.path));
	for (const packagePath of await findComponentPackagePaths()) {
		assert.equal(componentPackagePaths.has(packagePath), true, `${packagePath} is missing from provenance.component_packages`);
	}

	const vendoredPaths = new Set(report.vendored_or_symlinked.map((entry) => entry.path));
	for (const runtimeRoot of runtimeRoots) {
		assert.equal(vendoredPaths.has(runtimeRoot), true, `${runtimeRoot} is missing from provenance.vendored_or_symlinked`);
	}

	for (const entry of [...report.generated, ...report.vendored_or_symlinked]) {
		assert.equal(typeof entry.owner, "string", `${entry.path} must have an owner`);
		assert.notEqual(entry.owner.length, 0, `${entry.path} owner must be non-empty`);
		assert.equal(typeof entry.build_step, "string", `${entry.path} must have a build step`);
		assert.notEqual(entry.build_step.length, 0, `${entry.path} build step must be non-empty`);
		assert.equal(typeof entry.status, "string", `${entry.path} must have a status classification`);
	}

	const nestedSourceRoot = report.source_roots.find((entry) => entry.path === "src");
	assert.ok(nestedSourceRoot, "nested src/ must be listed as a source root");
	assert.equal(nestedSourceRoot.classification, "reference-only/out-of-scope");
});

test("#given provenance anti-slop budget #when source modules are checked #then each module stays under the pure LOC ceiling", async () => {
	const modulePaths = ["scripts/lazyantigravity-provenance.mjs", ...(await findModulePaths("scripts/lazyantigravity-provenance"))];

	for (const modulePath of modulePaths) {
		const source = await readFile(join(root, modulePath), "utf8");
		const pureLoc = source.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("//")).length;
		assert.ok(pureLoc <= 250, `${modulePath} has ${pureLoc} pure LOC`);
		assert.equal(source.includes("SIZE_OK"), false, `${modulePath} must decompose instead of opting out`);
	}
});

function readProvenanceReport() {
	const result = spawnSync("node", ["scripts/lazyantigravity-provenance.mjs", "--json"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	return JSON.parse(result.stdout);
}

async function findComponentDistDirs() {
	const componentsRoot = join(root, "components");
	const entries = await readdir(componentsRoot, { withFileTypes: true });
	const distDirs = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const distPath = join(componentsRoot, entry.name, "dist");
		try {
			const stats = await lstat(distPath);
			if (stats.isDirectory()) distDirs.push(`components/${entry.name}/dist`);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
			throw error;
		}
	}
	return distDirs.sort();
}

async function findComponentPackagePaths() {
	const componentsRoot = join(root, "components");
	const entries = await readdir(componentsRoot, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => `components/${entry.name}/package.json`)
		.sort();
}

async function findModulePaths(relativeDir) {
	const entries = await readdir(join(root, relativeDir), { withFileTypes: true });
	const paths = [];
	for (const entry of entries) {
		const entryPath = `${relativeDir}/${entry.name}`;
		if (entry.isDirectory()) {
			paths.push(...(await findModulePaths(entryPath)));
		} else if (entry.isFile() && entry.name.endsWith(".mjs")) {
			paths.push(entryPath);
		}
	}
	return paths.sort();
}

function assertSection(report, section) {
	assert.ok(Array.isArray(report[section]), `provenance.${section} must be an array`);
}
