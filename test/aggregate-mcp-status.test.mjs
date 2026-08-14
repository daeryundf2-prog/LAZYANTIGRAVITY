import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

test("#given aggregate MCP configs #when status JSON is requested #then local servers are classified", () => {
	const result = spawnSync("node", ["scripts/lazyantigravity-mcp-status.mjs", "--json"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);

	const report = JSON.parse(result.stdout);
	assert.deepEqual(
		report.servers.map((server) => server.name).sort(),
		["ast_grep", "git_bash", "lsp"],
	);

	for (const server of report.servers) {
		assert.equal(typeof server.name, "string", "server must have name");
		assert.equal(typeof server.trust_class, "string", `${server.name} must have trust_class`);
		assert.equal(typeof server.command_or_type, "string", `${server.name} must have command_or_type`);
		assert.equal(typeof server.status, "string", `${server.name} must have status`);
	}

	for (const name of ["ast_grep", "git_bash", "lsp"]) {
		const server = report.servers.find((entry) => entry.name === name);
		assert.ok(server, `${name} must be present`);
		assert.match(server.trust_class, /^local_/);
		assert.equal(server.target_exists, true, `${name} target must exist`);
		assert.equal(typeof server.target_path, "string", `${name} must report target_path`);
	}

	assert.equal(report.risks.offline_remote_count, 0);
	assert.equal(report.risks.no_remote_mode, true);
});

test("#given missing configured MCP target with runtime fallback #when status JSON is requested #then configured target remains unhealthy", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "lazyantigravity-mcp-status-"));
	const configPath = join(tempDir, "mcp_config.json");
	writeFileSync(
		configPath,
		JSON.stringify({
			mcpServers: {
				ast_grep: {
					command: "node",
					args: ["./missing/ast-grep-mcp/dist/cli.js", "mcp"],
					cwd: ".",
				},
			},
		}),
	);

	const result = spawnSync("node", ["scripts/lazyantigravity-mcp-status.mjs", "--json", "--config", configPath], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);

	const report = JSON.parse(result.stdout);
	assert.equal(report.servers.length, 1);
	const [server] = report.servers;
	assert.equal(server.name, "ast_grep");
	assert.equal(server.status, "missing-target");
	assert.equal(server.trust_class, "local_missing");
	assert.equal(server.target_path, "missing/ast-grep-mcp/dist/cli.js");
	assert.equal(server.configured_target_path, "missing/ast-grep-mcp/dist/cli.js");
	assert.equal(server.target_exists, false);
	assert.equal(server.configured_target_exists, false);
	assert.equal(server.fallback_target_path, "ast-grep-mcp/dist/cli.js");
	assert.equal(server.fallback_target_exists, true);
});
