import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

test("media baseline exposes tools without invoking child binaries", () => {
	const res = spawnSync(process.execPath, [fileURLToPath(new URL("media-mcp/dist/cli.js", root)), "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		encoding: "utf8", timeout: 5000,
		env: { ...process.env, LAZYANTIGRAVITY_OFFLINE: "1" },
	});
	assert.equal(res.status, 0, res.stderr);
	assert.equal(JSON.parse(res.stdout).result.tools.length, 8);
});

test("AST replacement is explicit, counted and dry-run by default through JSON-RPC", () => {
	const dir = mkdtempSync(join(tmpdir(), "mcp-hardening-ast-"));
	const path = join(dir, "sample.js");
	writeFileSync(path, "const a = 1; const a2 = 1;\n");
	const call = (args) => {
		const res = spawnSync(process.execPath, [fileURLToPath(new URL("ast-grep-mcp/src/cli.mjs", root)), "mcp"], {
			input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ast_grep_replace", arguments: { paths: ["sample.js"], ...args } } }),
			encoding: "utf8", timeout: 5000, cwd: dir,
			env: { ...process.env, LAZYANTIGRAVITY_WORKSPACE_ROOT: dir, LAZYANTIGRAVITY_OFFLINE: "1", LAZYANTIGRAVITY_AST_ENGINE: "regex" },
		});
		assert.equal(res.status, 0, res.stderr);
		return JSON.parse(JSON.parse(res.stdout).result.content[0].text);
	};
	const unavailable = call({ pattern: "const a = 1;", rewrite: "const a = 2;", dryRun: false });
	assert.equal(unavailable.ok, false);
	assert.match(unavailable.error, /Structural engine unavailable/);
	const preview = call({ pattern: "= 1", rewrite: "= 2", regex: true });
	assert.equal(preview.ok, true);
	assert.equal(preview.dryRun, true);
	assert.equal(preview.changedFiles[0].replacements, 2);
	assert.match(readFileSync(path, "utf8"), /= 1/);
	const applied = call({ pattern: "= 1", rewrite: "= 2", regex: true, dryRun: false });
	assert.equal(applied.ok, true);
	assert.equal(applied.changedFiles[0].replacements, 2);
	assert.equal(readFileSync(path, "utf8"), "const a = 2; const a2 = 2;\n");
	const invalid = call({ pattern: "[", rewrite: "x", regex: true });
	assert.equal(invalid.ok, false);
});

test("structural replacement rejects overlapping edits rather than reporting an invented count", () => {
	const source = readFileSync(new URL("ast-grep-mcp/src/cli.mjs", root), "utf8");
	const start = source.indexOf("function structuralReplace");
	const end = source.indexOf("const LANGUAGE_EXTENSIONS", start);
	let committed = false;
	const replace = runInNewContext(`${source.slice(start, end)}\nstructuralReplace`, {
		napiLanguageKeyForFile: () => "JavaScript",
		interpolateRewrite: () => "replacement",
	});
	const napi = { Lang: { JavaScript: 1 }, parse: () => ({ root: () => ({
		findAll: () => [{ replace: () => ({ startPos: 0, endPos: 8 }) }, { replace: () => ({ startPos: 2, endPos: 4 }) }],
		commitEdits: () => { committed = true; return "changed"; },
	}) }) };
	assert.equal(replace(napi, "sample.js", "synthetic", "pattern", "rewrite"), null);
	assert.equal(committed, false);
});

test("media validation order: binary availability never gates input confinement", () => {
	const text = readFileSync(new URL("media-mcp/src/cli.mjs", root), "utf8");
	for (const fn of ["mediaProbe", "mediaFrames", "mediaOcr"]) {
		const start = text.indexOf(`async function ${fn}`);
		const end = Math.min(...[text.indexOf("\nasync function ", start + 10), text.indexOf("\nfunction ", start + 10)].filter((i) => i > start));
		const body = text.slice(start, end);
		assert.ok(body.indexOf("confineInputPath") < body.indexOf("missingBinaryResult"), `${fn} must confine input before reporting a missing binary`);
	}
	const transcribe = text.slice(text.indexOf("function transcribeValidation"), text.indexOf("function mediaTranscribeStart"));
	assert.ok(transcribe.indexOf("missingBinaryResult") < transcribe.indexOf("confineInputPath"), "transcribeValidation keeps its historical binary-first contract");
});

test("git policy classifies stash defaults and reflog operations without executing git", () => {
	const source = readFileSync(new URL("git-bash-mcp/src/cli.mjs", root), "utf8");
	const policySource = source.slice(source.indexOf("const GIT_READ_ONLY_SUBCOMMANDS"), source.indexOf("function tokenizeCommand")) + source.slice(source.indexOf("function gitPolicyError"), source.indexOf("function parseSafeCommand"));
	for (const optIn of ["", "1"]) {
		const policy = runInNewContext(`${policySource}\ngitPolicyError`, { process: { env: { LAZYANTIGRAVITY_GIT_WRITE: optIn } } });
		assert.equal(policy("stash", []) === null, optIn === "1");
		assert.equal(policy("stash", ["list"]), null);
		assert.equal(policy("stash", ["show"]), null);
		assert.equal(policy("reflog", []), null);
		assert.equal(policy("reflog", ["show"]), null);
		for (const operation of ["expire", "delete", "drop", "write"]) assert.equal(typeof policy("reflog", [operation]), "string");
	}
});
