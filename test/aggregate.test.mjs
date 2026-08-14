import assert from "node:assert/strict";
import test from "node:test";

import { collectCommandHooks, findSpawnAgentTypes, findRoleSpecificSpawnsWithoutForkTurnsNone } from "./aggregate-plugin-fixture.mjs";

test("#given compatibility sentinel #when loaded #then passes successfully", () => {
	assert.ok(true);
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
