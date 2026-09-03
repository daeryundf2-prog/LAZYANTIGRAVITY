import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectCommandHooks, findSpawnAgentTypes, findRoleSpecificSpawnsWithoutForkTurnsNone } from "./aggregate-plugin-fixture.mjs";

test("#given the committed hook manifest #when loaded #then every command hook has a command and a positive timeout", async () => {
	const manifestPath = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	let commandHooks = 0;
	for (const groups of Object.values(manifest.hooks)) {
		for (const group of groups) {
			for (const hook of group.hooks ?? []) {
				if (hook.type !== "command") continue;
				commandHooks++;
				assert.ok(typeof hook.command === "string" && hook.command.length > 0, "command hook must declare a command");
				assert.ok(Number.isFinite(hook.timeout) && hook.timeout > 0, "command hook must declare a positive timeout");
			}
		}
	}
	assert.equal(commandHooks, 26, "expected 26 command hooks (including json_schema_guard)");
});

test("#given hook manifest structure #when collecting command hooks #then filters and formats command handlers", () => {
	const mockHooks = {
		hooks: {
			SessionStart: [
				{
					hooks: [
						{
							type: "command",
							command: "node test.js",
							timeout: 10,
						},
						{
							type: "other",
						}
					]
				}
			]
		}
	};
	const collected = collectCommandHooks(mockHooks, "mock-source");
	assert.equal(collected.length, 1);
	assert.equal(collected[0].handler.command, "node test.js");
});

test("#given agent helper search functions #when parsing spawn agent types #then correctly identifies types and options", () => {
	const mockContent = 'spawn_agent(agent_type="explorer", message="foo", fork_turns="none"); spawn_agent(agent_type="worker")';
	const types = findSpawnAgentTypes(mockContent);
	assert.deepEqual(types, ["explorer", "worker"]);

	const missingFork = findRoleSpecificSpawnsWithoutForkTurnsNone(mockContent);
	assert.equal(missingFork.length, 1);
	assert.match(missingFork[0], /agent_type="worker"/);
});
