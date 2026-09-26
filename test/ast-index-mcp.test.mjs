import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = join(ROOT, "ast-index-mcp", "dist", "cli.js");

function callTool(name, args, cwd) {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
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

test("ast-index-mcp exposes the four AST index and impact tools", () => {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
		encoding: "utf8",
		timeout: 10000,
	});
	assert.equal(res.status, 0);
	const tools = JSON.parse(res.stdout).result.tools.map((t) => t.name);
	assert.deepEqual(tools, [
		"ast_index_scan",
		"ast_index_find",
		"ast_index_callers",
		"ast_index_impact"
	]);
});

test("ast-index-mcp tools scan, find symbols, trace callers, and compute blast radius", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "mcp-ast-test-"));
	try {
		const fA = join(tempDir, "auth.ts");
		const fB = join(tempDir, "service.ts");
		const fTest = join(tempDir, "service.test.ts");

		writeFileSync(fA, "export function authenticate(token: string) { return true; }\n");
		writeFileSync(fB, "import { authenticate } from './auth.js';\nexport function loginUser() { authenticate('abc'); }\n");
		writeFileSync(fTest, "import { loginUser } from './service.js';\nfunction testLogin() { loginUser(); }\n");

		// 1. Scan
		const scanResult = callTool("ast_index_scan", { path: tempDir }, tempDir);
		assert.equal(scanResult.ok, true);
		assert.equal(scanResult.fileCount, 3);

		// 2. Find
		const findResult = callTool("ast_index_find", { name: "authenticate", path: tempDir }, tempDir);
		assert.equal(findResult.ok, true);
		assert.equal(findResult.matchCount, 1);
		assert.equal(findResult.symbols[0].name, "authenticate");
		assert.equal(findResult.symbols[0].isExported, true);

		// 3. Callers
		const callersResult = callTool("ast_index_callers", { name: "authenticate", path: tempDir }, tempDir);
		assert.equal(callersResult.ok, true);
		assert.equal(callersResult.callerCount, 1);
		assert.equal(callersResult.callers[0].caller, "loginUser");

		// 4. Impact / Transitive Blast Radius
		const impactResult = callTool("ast_index_impact", { target: fA, type: "file", path: tempDir }, tempDir);
		assert.equal(impactResult.ok, true);
		assert.ok(impactResult.affectedFiles.includes(fB));
		assert.ok(impactResult.affectedFiles.includes(fTest));
		assert.ok(impactResult.affectedTestFiles.includes(fTest));
		assert.equal(impactResult.affectedTestCount, 1);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
