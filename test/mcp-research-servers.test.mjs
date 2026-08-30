import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("#given default MCP config #when inspected #then only local servers are enabled", async () => {
	// given
	const mcp = JSON.parse(await readFile(join(root, "mcp_config.json"), "utf8"));
	const remoteExample = JSON.parse(
		await readFile(join(root, "mcp_config.remote.example.json"), "utf8"),
	);

	// when
	const serverNames = Object.keys(mcp.mcpServers).sort();

	// then
	assert.deepEqual(serverNames, ["ast_grep", "git_bash", "lsp", "media", "research", "workspace"]);
	assert.deepEqual(Object.keys(remoteExample.mcpServers).sort(), ["context7", "grep_app"]);
	assert.equal(remoteExample.mcpServers.grep_app.url, "https://mcp.grep.app");
	assert.equal(remoteExample.mcpServers.context7.url, "https://mcp.context7.com/mcp");
});
