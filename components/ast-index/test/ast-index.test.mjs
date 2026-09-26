import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { indexSourceFile } from "../dist/indexer.js";
import { buildIncrementalASTGraph } from "../dist/cache.js";
import { findSymbols, findCallers, computeBlastRadius } from "../dist/query.js";

test("indexSourceFile extracts functions, classes, interfaces, imports and calls", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ast-index-test-"));
	try {
		const sampleFile = join(tempDir, "service.ts");
		const content = `
import { Config } from "./config.js";

export interface UserDTO {
	id: string;
}

export class UserService {
	getUser() {}
}

export function computeStats(users: UserDTO[]) {
	validateUser(users);
	return users.length;
}

function validateUser(u: unknown) {}
`;
		writeFileSync(sampleFile, content, "utf8");

		const result = indexSourceFile(sampleFile);
		assert.equal(result.file, sampleFile);
		assert.equal(result.imports.length, 1);
		assert.equal(result.imports[0], "./config.js");

		const symNames = result.symbols.map((s) => s.name);
		assert.ok(symNames.includes("UserDTO"));
		assert.ok(symNames.includes("UserService"));
		assert.ok(symNames.includes("computeStats"));
		assert.ok(symNames.includes("validateUser"));

		const hasCall = result.calls.some((c) => c.caller === "computeStats" && c.callee === "validateUser");
		assert.ok(hasCall);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("buildIncrementalASTGraph and query functions support symbols, callers, and blast radius", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ast-graph-test-"));
	try {
		const f1 = join(tempDir, "auth.ts");
		const f2 = join(tempDir, "controller.ts");

		writeFileSync(f1, `
export function login(token: string) {
	return true;
}
`, "utf8");

		writeFileSync(f2, `
import { login } from "./auth.js";

export function handleRequest() {
	login("token123");
}
`, "utf8");

		const graph = buildIncrementalASTGraph(tempDir);
		assert.equal(Object.keys(graph.files).length, 2);

		const loginSym = findSymbols(graph, "login");
		assert.equal(loginSym.length, 1);
		assert.equal(loginSym[0].name, "login");

		const callers = findCallers(graph, "login");
		assert.equal(callers.length, 1);
		assert.equal(callers[0].caller, "handleRequest");

		const blast = computeBlastRadius(graph, f1);
		assert.equal(blast.affectedFiles.length, 1);
		assert.equal(blast.affectedFiles[0], f2);
		assert.equal(blast.totalCallers, 1);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("checkFileBlocking flags sync I/O inside async functions", async () => {
	const { checkFileBlocking } = await import("../dist/blocking-check.js");
	const tempDir = mkdtempSync(join(tmpdir(), "ast-index-blocking-"));
	try {
		const file = join(tempDir, "worker.ts");
		writeFileSync(file, `
import { readFileSync } from "node:fs";

async function loadConfig() {
	const raw = readFileSync("config.json", "utf8");
	return raw;
}

function okSync() {
	return readFileSync("x", "utf8"); // sync fn 안은 무시해야 한다
}
`);
		const findings = checkFileBlocking(file);
		const rules = findings.map((f) => f.rule);
		assert.deepEqual(rules, ["sync-io-in-async"]);
		assert.equal(findings[0].line, 5);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("checkFileBlocking flags ignored Result-returning calls", async () => {
	const { checkFileBlocking } = await import("../dist/blocking-check.js");
	const tempDir = mkdtempSync(join(tmpdir(), "ast-index-result-"));
	try {
		const file = join(tempDir, "svc.ts");
		writeFileSync(file, `
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function validate(): Result<boolean> {
	return { ok: true, value: true };
}

async function run() {
	validate();              // 무시 — flag
	await validate();        // awaited — ok
	const r = validate();    // bound — ok
	return validate();       // returned — ok
}
`);
		const findings = checkFileBlocking(file);
		assert.equal(findings.length, 1);
		assert.equal(findings[0].rule, "ignored-result");
		assert.equal(findings[0].line, 9);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("computeTransitiveBlastRadius traces multi-hop callers and flags test files", async () => {
	const { computeTransitiveBlastRadius } = await import("../dist/query.js");
	const tempDir = mkdtempSync(join(tmpdir(), "ast-transitive-test-"));
	try {
		const fCore = join(tempDir, "core.ts");
		const fService = join(tempDir, "service.ts");
		const fController = join(tempDir, "controller.ts");
		const fTest = join(tempDir, "service.test.ts");

		writeFileSync(fCore, "export function executeQuery() { return 42; }\n");
		writeFileSync(fService, "import { executeQuery } from './core.js';\nexport function fetchUser() { executeQuery(); }\n");
		writeFileSync(fController, "import { fetchUser } from './service.js';\nexport function handleUser() { fetchUser(); }\n");
		writeFileSync(fTest, "import { fetchUser } from './service.js';\nfunction testUser() { fetchUser(); }\n");

		const graph = buildIncrementalASTGraph(tempDir);
		const blast = computeTransitiveBlastRadius(graph, fCore, "file");

		assert.equal(blast.target, fCore);
		assert.ok(blast.affectedFiles.includes(fService));
		assert.ok(blast.affectedFiles.includes(fController));
		assert.ok(blast.affectedFiles.includes(fTest));
		assert.ok(blast.affectedTestFiles.includes(fTest));
		assert.ok(!blast.affectedTestFiles.includes(fService));
		assert.ok(blast.totalCallSites >= 3);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("indexSourceFile extracts Python, Rust, and Go symbols and calls", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ast-multilang-test-"));
	try {
		// Python
		const pyFile = join(tempDir, "app.py");
		writeFileSync(pyFile, "import os\nclass UserManager:\n    def get_user(self):\n        os.listdir()\n");
		const pyRes = indexSourceFile(pyFile);
		assert.equal(pyRes.symbols.length, 2);
		assert.ok(pyRes.symbols.some((s) => s.name === "UserManager" && s.kind === "class"));
		assert.ok(pyRes.symbols.some((s) => s.name === "get_user" && s.kind === "function"));
		assert.ok(pyRes.imports.includes("os"));

		// Rust
		const rsFile = join(tempDir, "lib.rs");
		writeFileSync(rsFile, "use std::sync::Arc;\npub struct Config;\npub fn run() { helper(); }\nfn helper() {}\n");
		const rsRes = indexSourceFile(rsFile);
		assert.ok(rsRes.symbols.some((s) => s.name === "Config" && s.kind === "struct"));
		assert.ok(rsRes.symbols.some((s) => s.name === "run" && s.isExported));
		assert.ok(rsRes.calls.some((c) => c.caller === "run" && c.callee === "helper"));

		// Go
		const goFile = join(tempDir, "main.go");
		writeFileSync(goFile, "package main\nimport \"fmt\"\ntype Server struct {}\nfunc Start() { fmt.Println() }\n");
		const goRes = indexSourceFile(goFile);
		assert.ok(goRes.symbols.some((s) => s.name === "Server" && s.kind === "struct"));
		assert.ok(goRes.symbols.some((s) => s.name === "Start" && s.isExported));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
