import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { exists, readJson, root } from "./aggregate-plugin-fixture.mjs";

test("#given aggregate plugin manifest #when inspected #then identity metadata follows the active package contract", async () => {
	// given
	const manifest = await readJson(".codex-plugin/plugin.json");
	const packageJson = await readJson("package.json");

	// then
	if (manifest.name === "lazyantigravity") {
		assert.deepEqual(manifest, {
			name: packageJson.name,
			description: packageJson.description,
		});
	} else {
		assert.equal(manifest.name, "omo");
		assert.equal(manifest.hooks, "./hooks/hooks.json");
		assert.equal(manifest.skills, "./skills/");
		assert.equal(manifest.mcpServers, "./.mcp.json");
	}
});

test("#given aggregate plugin metadata #when inspected #then ulw-loop is the public loop name", async () => {
	// given
	const isStandalone = (await readJson("package.json")).name === "lazyantigravity";
	const metadataText = isStandalone
		? await readFile(join(root, "package.json"), "utf8")
		: await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8");
	const metadata = JSON.parse(metadataText);

	// when
	const longDescription = String(metadata.interface?.longDescription ?? "");

	// then
	assert.match(longDescription, /ulw-loop/);
});

test("#given component directories #when scanned #then only intentional resource roots declare plugin manifests", async () => {
	// given
	const components = await readdir(join(root, "components"), { withFileTypes: true });
	const expectedComponentManifests = new Map([["rules", { hooks: "./hooks/hooks.json" }]]);
	const isStandalone = (await readJson("package.json")).name === "lazyantigravity";

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
		"comment-checker",
		"git-bash",
		"lsp",
		"rules",
		"start-work-continuation",
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
