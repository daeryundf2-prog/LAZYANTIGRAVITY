import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("#given aggregate MCP config #when inspected #then remote research MCPs are opt-in only", async () => {
	// given
	const mcp = JSON.parse(await readFile(join(root, "mcp_config.json"), "utf8"));
	const optIn = JSON.parse(await readFile(join(root, "examples", "mcp-remote.opt-in.json"), "utf8"));

	// when
	const serverNames = Object.keys(mcp.mcpServers).sort();
	const optInText = JSON.stringify(optIn);

	// then
	assert.deepEqual(serverNames, ["database", "git-bash", "lsp"]);
	assert.equal("grep_app" in mcp.mcpServers, false);
	assert.equal("context7" in mcp.mcpServers, false);
	assert.equal("xds" in mcp.mcpServers, false);
	assert.equal(mcp.mcpServers.lsp.args[0], "./components/lsp-daemon/dist/cli.js");
	assert.equal(mcp.mcpServers.lsp.args[1], "mcp");
	assert.match(optInText, /example\.invalid/);
	assert.match(optInText, /serverUrl/);
	assert.doesNotMatch(optInText, /"url"/);
});
