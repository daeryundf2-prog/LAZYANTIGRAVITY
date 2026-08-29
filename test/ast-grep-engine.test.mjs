import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = join(ROOT, "ast-grep-mcp", "dist", "cli.js");
// The structural engine needs the optional @ast-grep/napi dependency, installed
// inside ast-grep-mcp/node_modules but absent in a plain CI checkout. Tests
// must pass in both worlds.
const structuralAvailable = existsSync(
	join(ROOT, "ast-grep-mcp", "node_modules", "@ast-grep", "napi", "package.json"),
);

function callTool(name, args, cwd, env = {}) {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		encoding: "utf8",
		timeout: 20000,
		cwd,
		env: { ...process.env, ...env },
	});
	assert.equal(res.status, 0, res.stderr);
	const output = JSON.parse(res.stdout);
	assert.ok(output.result, JSON.stringify(output));
	return JSON.parse(output.result.content[0].text);
}

function withSource(fn) {
	const dir = mkdtempSync(join(tmpdir(), "ag-eng-"));
	try {
		writeFileSync(
			join(dir, "sample.ts"),
			"const a = 1;\nconst b = 2;\nfunction add() {\n  return a + b;\n}\nconsole.log(add());\n",
			"utf8",
		);
		fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("structural engine matches multi-line patterns the regex engine cannot", () => {
	withSource((dir) => {
		const structural = callTool("ast_grep_search", { pattern: "function add() { $$$B }" }, dir);
		const regex = callTool("ast_grep_search", { pattern: "function add() { $$$B }" }, dir, {
			LAZYANTIGRAVITY_AST_ENGINE: "regex",
		});
		// A brace block spans lines: only the structural engine can see it.
		assert.equal(regex.totalMatches, 0, "line-based fallback cannot match across lines");
		if (!structuralAvailable) {
			assert.equal(structural.totalMatches, 0, "without @ast-grep/napi the search must fall back to the regex engine");
			return;
		}
		assert.equal(structural.totalMatches, 1, "structural engine must match the multi-line function");
		assert.equal(structural.matches[0].line, 3);
	});
});

test("structural replacement rewrites code and respects dry-run", () => {
	withSource((dir) => {
		// Metavariable-free pattern/rewrite keeps this valid for the structural
		// engine (node-level replace) and the regex fallback alike.
		const preview = callTool(
			"ast_grep_replace",
			{ pattern: "const a = 1;", rewrite: "const a = 42;", dryRun: true },
			dir,
		);
		assert.equal(preview.dryRun, true);
		assert.equal(preview.totalFilesChanged, 1);
		assert.ok(readFileSync(join(dir, "sample.ts"), "utf8").includes("const a = 1;"), "dry-run must not write");

		const applied = callTool(
			"ast_grep_replace",
			{ pattern: "const a = 1;", rewrite: "const a = 42;", dryRun: false },
			dir,
		);
		assert.equal(applied.dryRun, false);
		const updated = readFileSync(join(dir, "sample.ts"), "utf8");
		assert.ok(updated.includes("const a = 42;"));
		assert.ok(updated.includes("return a + b;"), "unrelated lines must survive");
	});
});

test("regex fallback still handles patterns the parser rejects gracefully", () => {
	withSource((dir) => {
		const res = callTool("ast_grep_search", { pattern: "const a", regex: true }, dir);
		assert.equal(res.ok, true);
		assert.equal(res.totalMatches, 1);
	});
});
