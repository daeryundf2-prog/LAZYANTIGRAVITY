#!/usr/bin/env node
/**
 * Benchmark for the daemon-bridge IPC round trip (SET + GET) against an
 * in-process daemon over its local socket / named pipe.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { DaemonServer, getDaemonPaths } = await import(join(root, "components", "daemon-bridge", "dist", "server.js"));
const { DaemonClient } = await import(join(root, "components", "daemon-bridge", "dist", "client.js"));

const dir = mkdtempSync(join(tmpdir(), "bench-daemon-"));
const N = 500;
try {
	const config = getDaemonPaths(dir);
	const server = new DaemonServer(config);
	await server.start();
	const client = new DaemonClient(config);
	// warmup
	for (let i = 0; i < 20; i++) await client.set(`warm${i}`, "x");
	const samples = [];
	for (let i = 0; i < N; i++) {
		const start = process.hrtime.bigint();
		await client.set(`key${i}`, { seq: i });
		const value = await client.get(`key${i}`);
		const ms = Number(process.hrtime.bigint() - start) / 1e6;
		if (value?.seq !== i) throw new Error("round-trip mismatch");
		samples.push(ms);
	}
	await server.stop();
	samples.sort((a, b) => a - b);
	const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
	const p50 = samples[Math.floor(samples.length * 0.5)];
	const p95 = samples[Math.floor(samples.length * 0.95)];
	console.log(`[bench-daemon-rtt] set+get round trips n=${N} meanMs=${mean.toFixed(3)} p50Ms=${p50.toFixed(3)} p95Ms=${p95.toFixed(3)}`);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
