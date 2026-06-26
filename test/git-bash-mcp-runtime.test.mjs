import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

function parseJsonLines(stdout) {
	return stdout
		.trim()
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line));
}

test("#given non-Windows host #when git_bash MCP initializes #then it responds with diagnostic tools", () => {
	// given
	const cliPath = join(root, "components", "git-bash-mcp", "dist", "cli.js");
	const requestLines = [
		JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2024-11-05" },
		}),
		JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
	].join("\n");

	// when
	const result = spawnSync(process.execPath, [cliPath, "mcp"], {
		input: `${requestLines}\n`,
		encoding: "utf8",
		timeout: 5000,
	});

	// then
	assert.equal(result.status, 0, result.stderr);
	const responses = parseJsonLines(result.stdout);
	assert.equal(responses.length, 2);
	assert.equal(responses[0].id, 1);
	assert.equal(responses[0].result.serverInfo.name, "git_bash");
	assert.equal(responses[1].id, 2);

	const toolNames = responses[1].result.tools.map((tool) => tool.name).sort();
	if (process.platform === "win32") {
		assert.deepEqual(toolNames, ["diagnose", "run", "which_bash"]);
	} else {
		assert.deepEqual(toolNames, ["diagnose", "which_bash"]);
	}
});
