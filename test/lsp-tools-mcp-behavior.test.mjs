import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function callTool(name, args, cwd) {
	const res = spawnSync(process.execPath, [join(ROOT, "lsp-tools-mcp", "dist", "cli.js")], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		encoding: "utf8",
		timeout: 15000,
		cwd,
	});
	assert.equal(res.status, 0, res.stderr);
	const output = JSON.parse(res.stdout);
	assert.ok(output.result, JSON.stringify(output));
	return JSON.parse(output.result.content[0].text);
}

test("lsp-tools-mcp tolerates regex metacharacters in symbols", () => {
	const dir = mkdtempSync(join(tmpdir(), "lsp-mcp-regex-"));
	try {
		writeFileSync(join(dir, "mod.ts"), "export function probe() { return 1; }\n", "utf8");
		const res = callTool("lsp_references", { filePath: "mod.ts", symbol: "a(b[c" }, dir);
		assert.equal(res.ok, true, "unescaped symbol must not crash RegExp construction");
		assert.equal(res.total, 0);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("lsp-tools-mcp distinguishes missing diagnostic tooling from a clean file", () => {
	const dir = mkdtempSync(join(tmpdir(), "lsp-mcp-tool-"));
	try {
		writeFileSync(join(dir, "data.json"), "{}\n", "utf8");
		const unsupported = callTool("lsp_diagnostics", { filePath: "data.json" }, dir);
		assert.equal(unsupported.ok, true);
		assert.equal(unsupported.toolAvailable, false, "unsupported extensions must not claim a clean bill of health");
		assert.match(unsupported.toolNote ?? "", /No diagnostics tool configured/);

		writeFileSync(join(dir, "mod.ts"), "export const value: number = 1;\n", "utf8");
		const ts = callTool("lsp_diagnostics", { filePath: "mod.ts" }, dir);
		assert.equal(ts.ok, true);
		assert.equal(typeof ts.toolAvailable, "boolean");
		if (ts.toolAvailable === false) {
			assert.match(ts.toolNote ?? "", /NOT INSTALLED/, "missing tooling must carry the NOT INSTALLED marker");
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
