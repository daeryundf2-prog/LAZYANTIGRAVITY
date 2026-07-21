import assert from "node:assert/strict";
import { readFile, stat, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { MODEL_ROUTING_CAPABILITY } from "../scripts/runtime-adapter.mjs";
import { migrateCodexConfig } from "../scripts/migrate-codex-config.mjs";

const expectedResult = {
	changed: [],
	modelRouting: MODEL_ROUTING_CAPABILITY,
};

test("[todo14.migration-noop] #given existing user config and state #when migration runs #then bytes remain unchanged and static capability is returned", async () => {
	const fixture = await mkdtemp(join(tmpdir(), "todo14-migration-noop-"));
	try {
		const codexHome = join(fixture, "codex-home");
		const statePath = join(fixture, "model-state.json");
		const configPath = join(codexHome, "config.toml");
		await mkdir(codexHome, { recursive: true });
		await writeFile(configPath, 'model = "user-selected"\ncustom = true\n');
		await writeFile(statePath, '{"owned":"by-user"}\n');
		const configBefore = await readFile(configPath);
		const stateBefore = await readFile(statePath);

		const result = await migrateCodexConfig({
			env: { CODEX_HOME: codexHome, LAZYCODEX_MODEL_CATALOG_STATE_PATH: statePath },
			cwd: fixture,
		});

		assert.deepEqual(result, expectedResult);
		assert.equal(result.modelRouting, MODEL_ROUTING_CAPABILITY);
		assert.deepEqual(await readFile(configPath), configBefore);
		assert.deepEqual(await readFile(statePath), stateBefore);
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
});

test("[todo14.migration-noop] #given absent config, state, and catalog #when migration runs #then no filesystem state is created", async () => {
	const fixture = await mkdtemp(join(tmpdir(), "todo14-migration-absent-"));
	try {
		const codexHome = join(fixture, "codex-home");
		const statePath = join(fixture, "state", "model-state.json");
		const catalogPath = join(fixture, "catalog", "model-catalog.json");
		const result = await migrateCodexConfig({
			env: {
				CODEX_HOME: codexHome,
				LAZYCODEX_MODEL_CATALOG_STATE_PATH: statePath,
				LAZYCODEX_MODEL_CATALOG_PATH: catalogPath,
			},
			cwd: fixture,
		});

		assert.deepEqual(result, expectedResult);
		await assert.rejects(stat(codexHome), { code: "ENOENT" });
		await assert.rejects(stat(statePath), { code: "ENOENT" });
		await assert.rejects(stat(catalogPath), { code: "ENOENT" });
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
});

test("[todo14.migration-surface] #given migration module #when imported #then only compatible no-op entrypoint is exported", async () => {
	const module = await import("../scripts/migrate-codex-config.mjs");
	assert.deepEqual(Object.keys(module), ["migrateCodexConfig"]);
});

test("[todo14.migration-surface] #given migration source #when inspected #then no filesystem write surface remains", async () => {
	const source = await readFile(join(process.cwd(), "scripts", "migrate-codex-config.mjs"), "utf8");
	assert.doesNotMatch(source, /node:fs|writeFile|mkdir|appendFile|rename|unlink|rm\s*\(/);
});

test("[todo14.migration-cli] #given isolated user paths #when CLI is invoked #then it exits zero silently without changes", async () => {
	const fixture = await mkdtemp(join(tmpdir(), "todo14-migration-cli-"));
	try {
		const configPath = join(fixture, "codex-home", "config.toml");
		await mkdir(join(fixture, "codex-home"), { recursive: true });
		await writeFile(configPath, "user_setting = true\n");
		const before = await readFile(configPath);
		const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "migrate-codex-config.mjs")], {
			cwd: fixture,
			env: {
				...process.env,
				CODEX_HOME: join(fixture, "codex-home"),
				LAZYCODEX_MODEL_CATALOG_STATE_PATH: join(fixture, "state.json"),
			},
			encoding: "utf8",
			windowsHide: true,
		});

		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, "");
		assert.equal(result.stderr, "");
		assert.deepEqual(await readFile(configPath), before);
		await assert.rejects(stat(join(fixture, "state.json")), { code: "ENOENT" });
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
});
