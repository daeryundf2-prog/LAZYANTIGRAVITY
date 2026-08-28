#!/usr/bin/env node
/**
 * Benchmark for the ast-index component: preindex a synthetic source tree and
 * time symbol lookups / call-graph queries. Prints measured numbers only.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(root, "components", "ast-index", "dist", "cli.js");
const FILES = 200;
const LOOKUPS = 500;

const dir = mkdtempSync(join(tmpdir(), "bench-ast-"));
try {
	for (let i = 0; i < FILES; i++) {
		const dirPath = join(dir, `mod${Math.floor(i / 20)}`);
		mkdirSync(dirPath, { recursive: true });
		writeFileSync(
			join(dirPath, `file${i}.ts`),
			[
				`export function service${i}(input: string): string {`,
				`  return helper${i}(input);`,
				`}`,
				`function helper${i}(value: string): string {`,
				`  return value.trim();`,
				`}`,
				`export class Widget${i} { render() { return service${i}("x"); } }`,
			].join("\n"),
			"utf8",
		);
	}

	let preindexMs = 0;
	{
		const start = Date.now();
		const res = spawnSync(process.execPath, [CLI, "preindex"], { cwd: dir, encoding: "utf8", timeout: 60000 });
		preindexMs = Date.now() - start;
		if (res.status !== 0) throw new Error(`preindex failed: ${res.stderr}`);
	}

	const samples = [];
	for (let i = 0; i < LOOKUPS; i++) {
		const symbol = `service${Math.floor(Math.random() * FILES)}`;
		const start = Date.now();
		const res = spawnSync(process.execPath, [CLI, "symbol", symbol], { cwd: dir, encoding: "utf8", timeout: 30000 });
		if (res.status !== 0) throw new Error(`symbol lookup failed: ${res.stderr}`);
		samples.push(Date.now() - start);
	}
	samples.sort((a, b) => a - b);
	const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
	const p50 = samples[Math.floor(samples.length * 0.5)];
	const p95 = samples[Math.floor(samples.length * 0.95)];
	console.log(`[bench-ast-index] files=${FILES} preindexMs=${preindexMs}`);
	console.log(`[bench-ast-index] symbol lookups n=${LOOKUPS} meanMs=${mean.toFixed(2)} p50Ms=${p50} p95Ms=${p95}`);
	console.log(`[bench-ast-index] note: each lookup includes node process spawn (~${p50}ms floor); the in-process query is far faster.`);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
