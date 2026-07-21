import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function readJson(relativePath) {
	return JSON.parse(await readFile(join(root, relativePath), "utf8"));
}

async function exists(relativePath) {
	try {
		await stat(join(root, relativePath));
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

async function sha256(relativePath) {
	const content = await readFile(join(root, relativePath));
	return createHash("sha256").update(content).digest("hex");
}

test("#given Antigravity root MCP config #when discovered #then only intentional local stdio servers are active", async () => {
	const config = await readJson("mcp_config.json");
	const serverIds = Object.keys(config.mcpServers).sort();

	assert.deepEqual(serverIds, ["database", "git-bash", "lsp"]);
	assert.equal(await exists(".mcp.json"), false);

	for (const [serverId, server] of Object.entries(config.mcpServers)) {
		assert.equal(server.command, "node", `${serverId} must use PATH literal node`);
		assert.equal(server.cwd, ".", `${serverId} must run from staged root`);
		assert.ok(Array.isArray(server.args), `${serverId} must use stdio args`);
		assert.ok(server.args.length > 0, `${serverId} must have a runnable entrypoint`);
		assert.equal(server.args.some((arg) => isAbsolute(arg)), false, `${serverId} args must be root-relative`);
		assert.equal(server.args.some((arg) => arg.startsWith("../")), false, `${serverId} args must not escape the staged root`);
		assert.equal("url" in server, false, `${serverId} must not use remote url`);
		assert.equal("serverUrl" in server, false, `${serverId} must not use remote serverUrl`);
		assert.equal("headers" in server, false, `${serverId} must not carry active remote headers`);
	}

	assert.deepEqual(config.mcpServers["git-bash"].args, ["./components/git-bash-mcp/dist/cli.js", "mcp"]);
	assert.deepEqual(config.mcpServers.lsp.args, ["./components/lsp-daemon/dist/cli.js", "mcp"]);
	assert.deepEqual(config.mcpServers.database.args, ["./scripts/database-mcp.mjs"]);
});

test("#given remote MCP examples #when checked #then they remain opt-in and sanitized", async () => {
	const activeConfigText = await readFile(join(root, "mcp_config.json"), "utf8");
	const optInExample = await readJson("examples/mcp-remote.opt-in.json");
	const serializedExample = JSON.stringify(optInExample);

	assert.doesNotMatch(activeConfigText, /grep_app|context7|xds|serverUrl|https?:\/\/|headers|Authorization|TOKEN|SECRET/i);
	assert.match(serializedExample, /example\.invalid/);
	assert.match(serializedExample, /serverUrl/);
	assert.doesNotMatch(serializedExample, /"url"/);
	assert.doesNotMatch(serializedExample, /Bearer|TOKEN|SECRET|api[_-]?key/i);
});

test("#given pinned MCP contract docs #when hashed #then required fingerprints are preserved", async () => {
	const pinned = await readJson("contracts/mcp/pinned-hashes.json");

	assert.equal(
		pinned.antigravity.mcp.pinnedMarkdownSha256,
		"d7b3886d23fdfc25492ac704796b99788abb64ad682c80e525f39edb26b52cf8",
	);
	assert.equal(await exists(pinned.antigravity.mcp.vendoredPath), true);
	assert.equal(await sha256(pinned.antigravity.mcp.vendoredPath), pinned.antigravity.mcp.pinnedMarkdownSha256);

	const mcpDocs = pinned.modelContextProtocol;
	assert.equal(await sha256(mcpDocs["2025-06-18"].lifecycle.vendoredPath), mcpDocs["2025-06-18"].lifecycle.sha256);
	assert.equal(await sha256(mcpDocs["2025-06-18"].transports.vendoredPath), mcpDocs["2025-06-18"].transports.sha256);
	assert.equal(await sha256(mcpDocs["2024-11-05"].lifecycle.vendoredPath), mcpDocs["2024-11-05"].lifecycle.sha256);
	assert.equal(await sha256(mcpDocs["2024-11-05"].transports.vendoredPath), mcpDocs["2024-11-05"].transports.sha256);
});
