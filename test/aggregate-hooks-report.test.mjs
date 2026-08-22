import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { collectCommandHooks, readJson, root } from "./aggregate-plugin-fixture.mjs";

const execFile = promisify(execFileCallback);

async function runHooksReport(...args) {
	return execFile(process.execPath, ["scripts/lazyantigravity-hooks-report.mjs", ...args], {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 1024 * 1024,
	});
}

test("#given aggregate and component hooks #when JSON report is requested #then observability fields classify each command hook", async () => {
	const manifestSources = await findHookManifestSources();
	const expectedHookCount = (
		await Promise.all(manifestSources.map(async (source) => collectCommandHooks(await readJson(source), source).length))
	).reduce((total, count) => total + count, 0);

	const { stdout } = await runHooksReport("--json");
	const report = JSON.parse(stdout);

	assert.equal(report.format, "lazyantigravity-hooks-report.v1");
	assert.equal(report.source_count, manifestSources.length);
	assert.equal(report.hooks.length, expectedHookCount);
	assert(report.hooks.length > 0);

	for (const hook of report.hooks) {
		assert.equal(typeof hook.source, "string");
		assert.equal(typeof hook.event, "string");
		assert.equal(typeof hook.matcher, "string");
		assert.equal(typeof hook.command, "string");
		assert.equal(typeof hook.timeout, "number");
		assert.equal(typeof hook.status_message, "string");
		assert.notEqual(hook.status_message.trim(), "");
		assert.match(hook.failure_policy, /^(fail_open|fail_safe|fail_closed|hitl_required|none)$/);
		assert.match(hook.fallback_payload, /^(present|absent)$/);
		assert.match(hook.product_label_drift, /^(none|missing|legacy|unexpected)$/);
		if (hook.product_label_drift === "none") {
			assert.match(hook.status_message, /^LazyAntigravity\([^)]+\):\s+\S/);
		}
	}
});

test("#given malformed hook report args #when command runs #then it fails before printing a misleading report", async () => {
	await assert.rejects(() => runHooksReport("--json", "--unexpected"), {
		code: 1,
	});
});

async function findHookManifestSources() {
	const sources = [];
	const exists = async (path) => {
		try {
			const { access } = await import("node:fs/promises");
			await access(path);
			return true;
		} catch {
			return false;
		}
	};

	// 1. Read plugin.json to find the active hooks file
	const pluginJsonPath = join(root, "plugin.json");
	let activeHooksPath = "hooks/hooks.json"; // default fallback
	try {
		const { readFile } = await import("node:fs/promises");
		const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf8"));
		if (typeof pluginJson.hooks === "string") {
			activeHooksPath = pluginJson.hooks.replace(/^\.\//, "");
		}
	} catch {}

	// Add active hooks path if it exists
	if (await exists(join(root, activeHooksPath))) {
		sources.push(activeHooksPath);
	}

	// 2. Scan component directories for hooks
	const componentsDir = join(root, "components");
	if (await exists(componentsDir)) {
		const components = await readdir(componentsDir, { withFileTypes: true });
		for (const comp of components) {
			if (!comp.isDirectory()) continue;
			const compHooksPath = join("components", comp.name, "hooks", "hooks.json");
			if (await exists(join(root, compHooksPath))) {
				sources.push(compHooksPath);
			}
		}
	}

	return sources.sort((left, right) => left.localeCompare(right));
}
