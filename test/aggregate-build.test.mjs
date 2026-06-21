import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { readJson, root } from "./aggregate-plugin-fixture.mjs";

test("#given aggregate plugin build script #when inspected #then hook status and telemetry sync run before workspace builds", async () => {
	// given
	const packageJson = await readJson("package.json");
	const isStandalone = packageJson.name === "lazyantigravity";
	const telemetrySyncPath = isStandalone
		? join(root, "plugins", "scripts", "sync-telemetry-component.mjs")
		: join(root, "..", "scripts", "sync-telemetry-component.mjs");
	const telemetrySyncScript = await readFile(telemetrySyncPath, "utf8");

	// when
	const buildScript = packageJson.scripts.build;

	// then
	if (isStandalone) {
		assert.equal(
			buildScript,
			"node scripts/sync-hook-status-messages.mjs && node scripts/build-bundled-mcp-runtimes.mjs && node scripts/sync-skills.mjs && node plugins/scripts/sync-telemetry-component.mjs && node scripts/build-components.mjs",
		);
	} else {
		assert.equal(
			buildScript,
			"node scripts/sync-hook-status-messages.mjs && node scripts/build-bundled-mcp-runtimes.mjs && node scripts/sync-skills.mjs && node ../scripts/sync-telemetry-component.mjs && node scripts/build-components.mjs",
		);
	}
	assert.match(telemetrySyncScript, /syncTelemetryComponent/);
});

test("#given omo-codex package build script #when inspected #then delegates to the aggregate plugin package", async () => {
	// given
	const packageJson = await readJson("package.json");
	if (packageJson.name === "lazyantigravity") {
		// Standalone mode, skip parent checks
		return;
	}
	const parentPackageJson = JSON.parse(await readFile(join(root, "..", "package.json"), "utf8"));

	// when
	const buildPluginScript = parentPackageJson.scripts["build:plugin"];

	// then
	assert.equal(buildPluginScript, "bun run --cwd plugin build");
});
