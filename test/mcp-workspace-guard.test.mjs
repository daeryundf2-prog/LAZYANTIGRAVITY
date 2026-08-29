import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVERS = [
	"ast-grep-mcp/dist/cli.js",
	"git-bash-mcp/dist/cli.js",
	"lsp-tools-mcp/dist/cli.js",
	"workspace-mcp/dist/cli.js",
];

for (const server of SERVERS) {
	test(`[${server.split("/")[0]}] warns when launched inside PLUGIN_ROOT`, () => {
		const dir = mkdtempSync(join(tmpdir(), "mcp-guard-"));
		try {
			const res = spawnSync(process.execPath, [join(ROOT, server)], {
				input: "",
				encoding: "utf8",
				timeout: 15000,
				cwd: join(ROOT, server.split("/")[0]),
				env: { ...process.env, PLUGIN_ROOT: ROOT },
			});
			assert.match(res.stderr, /WARNING: cwd is inside PLUGIN_ROOT/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test(`[${server.split("/")[0]}] stays silent for a normal workspace cwd`, () => {
		const dir = mkdtempSync(join(tmpdir(), "mcp-guard-ok-"));
		try {
			const res = spawnSync(process.execPath, [join(ROOT, server)], {
				input: "",
				encoding: "utf8",
				timeout: 15000,
				cwd: dir,
			});
			assert.doesNotMatch(res.stderr, /WARNING: cwd is inside PLUGIN_ROOT/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
}
