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
