import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { exists, readJson, root } from "./aggregate-plugin-fixture.mjs";

test("#given aggregate plugin manifest #when inspected #then it owns the LazyAntigravity namespace", async () => {
	// given
	const manifest = await readJson("plugin.json");

	// when
	const hookPath = manifest.hooks;
	const skillsPath = manifest.skills;
	const mcpPath = manifest.mcpServers;

	// then
	assert.equal(manifest.name, "lazyantigravity");
	assert.equal(hookPath, "./hooks.json");
	assert.equal(skillsPath, "./skills/");
	assert.equal(mcpPath, "./mcp_config.json");
});

test("#given aggregate plugin metadata #when inspected #then ulw-loop is the public loop name", async () => {
	// given
	const manifestText = await readFile(join(root, "plugin.json"), "utf8");
	const manifest = JSON.parse(manifestText);

	// when
	const longDescription = String(manifest.interface?.longDescription ?? "");

	// then
	assert.match(longDescription, /ulw-loop/);
});

test("#given component directories #when scanned #then only intentional resource roots declare plugin manifests", async () => {
	// given
	const components = await readdir(join(root, "components"), { withFileTypes: true });
	const expectedComponentManifests = new Map();

	// when
	const componentNames = [];
	for (const entry of components) {
		if (!entry.isDirectory()) continue;
		if (!(await exists(join("components", entry.name, "package.json")))) continue;
		componentNames.push(entry.name);
	}
	componentNames.sort();

	// then
	assert.deepEqual(componentNames, [
		"active-learning",
		"adaptive-reasoning",
		"ast-index",
		"comment-checker",
		"daemon-bridge",
		"git-bash",
		"lsp",
		"memory",
		"quick-lane",
		"rules",
		"session-tree",
		"start-work-continuation",
		"telemetry",
		"ultrawork",
		"ulw-loop",
	]);
	for (const name of componentNames) {
		const expectedManifest = expectedComponentManifests.get(name);
		if (expectedManifest !== undefined) {
			assert.deepEqual(await readJson(join("components", name, ".codex-plugin", "plugin.json")), expectedManifest);
			continue;
		}

		await assert.rejects(
			readFile(join(root, "components", name, ".codex-plugin", "plugin.json"), "utf8"),
			/code: 'ENOENT'|ENOENT/,
		);
	}
});
