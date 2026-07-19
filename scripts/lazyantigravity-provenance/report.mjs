import { existsSync } from "node:fs";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";

import { buildScriptSurfaces, buildSteps, runtimeSurfaces } from "./data.mjs";
import { createDirtyStateClassifier, readDirtyState } from "./git-status.mjs";
import { compareByPath, normalizePath, pathContains } from "./path-utils.mjs";

export async function buildReport(root) {
	const dirtyStateEntries = readDirtyState(root);
	const dirtyState = createDirtyStateClassifier(root, dirtyStateEntries);
	const componentPackages = await readComponentPackages(root);
	const componentPackageReport = componentPackages.map((component) => componentPackageEntry(root, dirtyState, component));
	const buildScripts = buildScriptEntries(root, dirtyState);
	const generated = [
		...(await componentDistEntries(root, dirtyState, componentPackages)),
		generatedSurface(root, dirtyState, "skills", {
			kind: "synced-skills",
			owner: "aggregate skills bundle",
			build_step: "skill-sync",
		}),
		generatedSurface(root, dirtyState, "components/telemetry/src", {
			kind: "synced-component-source",
			owner: "telemetry component source mirror",
			build_step: "telemetry-component-sync",
		}),
	].sort(compareByPath);
	const vendoredOrSymlinked = (await Promise.all(runtimeSurfaces.map((surface) => vendoredEntry(root, dirtyState, surface)))).sort(compareByPath);
	const sourceRoots = await sourceRootEntries(root, dirtyState, componentPackages);
	const surfaces = [...generated, ...vendoredOrSymlinked, ...sourceRoots, ...componentPackageReport, ...buildScripts];

	return {
		product: "LazyAntigravity",
		root,
		generated,
		vendored_or_symlinked: vendoredOrSymlinked,
		source_roots: sourceRoots,
		component_packages: componentPackageReport,
		build_scripts: buildScripts,
		build_steps: buildSteps.map((step) => ({
			...step,
			owns: surfaces.filter((surface) => surface.build_step === step.id).map((surface) => surface.path).sort(),
		})),
		dirty_state: dirtyStateEntries.map((entry) => ({
			...entry,
			surfaces: surfaces
				.filter((surface) => pathContains(surface.path, entry.path))
				.map((surface) => surface.path)
				.sort(),
		})),
	};
}

async function readComponentPackages(root) {
	const componentsRoot = join(root, "components");
	const entries = await readdir(componentsRoot, { withFileTypes: true });
	const packages = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const packagePath = join("components", entry.name, "package.json");
		if (!existsSync(join(root, packagePath))) continue;
		const packageJson = JSON.parse(await readFile(join(root, packagePath), "utf8"));
		packages.push({
			path: `components/${entry.name}`,
			package_json: packagePath,
			name: packageJson.name ?? entry.name,
			build_script: packageJson.scripts?.build ?? null,
		});
	}
	return packages.sort(compareByPath);
}

function componentPackageEntry(root, dirtyState, component) {
	const statusEntries = dirtyState.dirtyEntriesForPath(component.package_json);
	return {
		path: component.package_json,
		kind: "component-package",
		owner: component.name,
		build_step: "component-workspace-build",
		component_root: component.path,
		component_build_script: component.build_script,
		exists: existsSync(join(root, component.package_json)),
		status: dirtyState.classifyPath(component.package_json, statusEntries),
		dirty_entries: statusEntries,
	};
}

function buildScriptEntries(root, dirtyState) {
	return buildScriptSurfaces.map((entry) => {
		const statusEntries = dirtyState.dirtyEntriesForPath(entry.path);
		return {
			...entry,
			exists: existsSync(join(root, entry.path)),
			status: dirtyState.classifyPath(entry.path, statusEntries),
			dirty_entries: statusEntries,
		};
	});
}

async function componentDistEntries(root, dirtyState, componentPackages) {
	const entries = [];
	for (const component of componentPackages) {
		const distPath = `${component.path}/dist`;
		if (!existsSync(join(root, distPath))) continue;
		entries.push(
			generatedSurface(root, dirtyState, distPath, {
				kind: "component-dist",
				owner: component.name,
				build_step: "component-workspace-build",
				package_json: component.package_json,
				component_build_script: component.build_script,
			}),
		);
	}
	return entries;
}

function generatedSurface(root, dirtyState, path, metadata) {
	const statusEntries = dirtyState.dirtyEntriesForPath(path);
	return {
		path,
		...metadata,
		exists: existsSync(join(root, path)),
		status: dirtyState.classifyPath(path, statusEntries),
		dirty_entries: statusEntries,
	};
}

async function vendoredEntry(root, dirtyState, surface) {
	const absolutePath = join(root, surface.path);
	const statusEntries = dirtyState.dirtyEntriesForPath(surface.path);
	const stats = await optionalLstat(absolutePath);
	const target = stats?.isSymbolicLink() ? normalizePath(relative(root, await realpath(absolutePath))) : null;
	return {
		...surface,
		exists: stats !== null,
		link_type: stats?.isSymbolicLink() ? "symlink" : "directory",
		target,
		target_matches_expected: target === null ? null : target === surface.expected_target,
		status: dirtyState.classifyPath(surface.path, statusEntries),
		dirty_entries: statusEntries,
	};
}

async function sourceRootEntries(root, dirtyState, componentPackages) {
	const entries = [
		...componentPackages.map((component) => sourceRootEntry(root, dirtyState, component)),
		{
			path: "src",
			kind: "nested-upstream-repository",
			owner: "upstream source checkout",
			build_step: "reference-only",
			classification: "reference-only/out-of-scope",
			exists: existsSync(join(root, "src")),
			status: dirtyState.classifyPath("src", dirtyState.dirtyEntriesForPath("src")),
			note: "Nested upstream source is retained for reference and package symlink targets; aggregate provenance does not mutate it.",
		},
		{
			path: "scripts",
			kind: "aggregate-build-scripts",
			owner: "aggregate build",
			build_step: "source",
			classification: "owned-source",
			exists: existsSync(join(root, "scripts")),
			status: dirtyState.classifyPath("scripts", dirtyState.dirtyEntriesForPath("scripts")),
		},
		{
			path: "plugins/scripts",
			kind: "upstream-build-scripts-symlink",
			owner: "upstream omo-codex scripts",
			build_step: "telemetry-component-sync",
			classification: "vendored-script-reference",
			exists: existsSync(join(root, "plugins/scripts")),
			status: dirtyState.classifyPath("plugins/scripts", dirtyState.dirtyEntriesForPath("plugins/scripts")),
		},
	];
	return entries.sort(compareByPath);
}

function sourceRootEntry(root, dirtyState, component) {
	const sourcePath = `${component.path}/src`;
	return {
		path: sourcePath,
		kind: "component-source",
		owner: component.name,
		build_step: "component-workspace-build",
		classification: "owned-source",
		exists: existsSync(join(root, sourcePath)),
		status: dirtyState.classifyPath(sourcePath, dirtyState.dirtyEntriesForPath(sourcePath)),
	};
}

async function optionalLstat(path) {
	try {
		return await lstat(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
}
