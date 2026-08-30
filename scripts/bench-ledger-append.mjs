#!/usr/bin/env node
/**
 * Benchmark for the ulw-loop ledger append hot path: measures per-append
 * cost across a growing ledger (100/400/800/1200 events). With the append
 * cache (ROADMAP 11) the cost must stay flat as the ledger grows; without
 * it every append re-reads and re-reconstructs the whole ledger (O(n^2)).
 * Prints measured numbers only.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { appendRunEvent, getRunDir } = await import(
	`file://${join(root, "components", "ulw-loop", "dist", "control-plane.js").replace(/\\/g, "/")}`
);

const TOTAL = 1200;
const CHECKPOINTS = [100, 400, 800, 1200];

	const repo = mkdtempSync(join(tmpdir(), "bench-ledger-"));
	try {
		const timings = [];
		let elapsed = 0;
		let prevElapsed = 0;
		let prevCount = 0;
		for (let i = 1; i <= TOTAL; i++) {
			const t0 = process.hrtime.bigint();
			await appendRunEvent(repo, "bench-run", "agent.progress", {
				agentId: "bencher",
				progress: `event-${i}`,
			});
			elapsed += Number(process.hrtime.bigint() - t0) / 1e6;
			if (CHECKPOINTS.includes(i)) {
				// 브래킷 구간 평균 — 누적값을 그대로 나누면 이전 구간이 섞여
				// 평탄한 비용도 증가하는 것처럼 보인다.
				timings.push({ at: i, perAppendMs: (elapsed - prevElapsed) / (i - prevCount) });
				prevElapsed = elapsed;
				prevCount = i;
			}
		}
	console.log(`[bench-ledger] ${TOTAL} appends into a growing ledger (events.jsonl)`);
	console.log("[bench-ledger] ledger size | per-append ms (measured)");
	for (const t of timings) {
		console.log(`[bench-ledger] ${String(t.at).padStart(11)} | ${t.perAppendMs.toFixed(3)}`);
	}
	const first = timings[0].perAppendMs;
	const last = timings[timings.length - 1].perAppendMs;
	const drift = ((last - first) / first) * 100;
	console.log(`[bench-ledger] drift 100 -> ${TOTAL} events: ${drift >= 0 ? "+" : ""}${drift.toFixed(1)}%`);
} finally {
	rmSync(join(repo, ".lazycodex"), { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
}
