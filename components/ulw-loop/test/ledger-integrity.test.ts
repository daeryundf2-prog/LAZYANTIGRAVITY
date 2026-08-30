import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRunEvent, getRunDir, readRunEvents } from "../src/control-plane.ts";
import { verifyLedgerIntegrity } from "../src/ledger-integrity.ts";

const testDir = join(fileURLToPath(new URL(".", import.meta.url)), "test-ledger-integrity-temp");

beforeEach(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

afterEach(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

describe("Ledger hash-chain integrity", () => {
	it("reports valid for a freshly appended event chain", async () => {
		const runId = "run-chain-1";
		await appendRunEvent(testDir, runId, "run.created", {});
		await appendRunEvent(testDir, runId, "run.state_changed", { state: "working" });
		await appendRunEvent(testDir, runId, "agent.dispatched", { agentId: "a1", role: "worker" });

		const result = await verifyLedgerIntegrity(testDir, runId);
		expect(result.valid).toBe(true);
		expect(result.eventCount).toBe(3);
	});

	it("detects a mismatched prevHash link", async () => {
		const runId = "run-chain-2";
		await appendRunEvent(testDir, runId, "run.created", {});
		await appendRunEvent(testDir, runId, "run.state_changed", { state: "working" });

		const eventsFile = join(getRunDir(testDir, runId), "events.jsonl");
		const lines = readFileSync(eventsFile, "utf8")
			.split("\n")
			.filter((l) => l.trim());
		const tampered = JSON.parse(lines[1] ?? "{}");
		tampered.prevHash = "f".repeat(64);
		const restored = [JSON.parse(lines[0] ?? "{}"), tampered].map((e) => JSON.stringify(e)).join("\n");
		const fs = await import("node:fs/promises");
		await fs.writeFile(eventsFile, `${restored}\n`, "utf8");

		const result = await verifyLedgerIntegrity(testDir, runId);
		expect(result.valid).toBe(false);
		expect(result.brokenIndex).toBe(1);
		expect(result.actualHash).toBe("f".repeat(64));
	});

	it("detects a corrupted event body hash", async () => {
		const runId = "run-chain-3";
		await appendRunEvent(testDir, runId, "run.created", {});

		const eventsFile = join(getRunDir(testDir, runId), "events.jsonl");
		const lines = readFileSync(eventsFile, "utf8")
			.split("\n")
			.filter((l) => l.trim());
		const tampered = JSON.parse(lines[0] ?? "{}");
		tampered.timestamp = "2999-01-01T00:00:00.000Z";
		const fs = await import("node:fs/promises");
		await fs.writeFile(eventsFile, `${JSON.stringify(tampered)}\n`, "utf8");

		const result = await verifyLedgerIntegrity(testDir, runId);
		expect(result.valid).toBe(false);
		expect(result.brokenIndex).toBe(0);

		const events = await readRunEvents(testDir, runId);
		expect(events.length).toBe(1);
		expect(result.expectedHash).not.toBe(result.actualHash);
	});

	it("keeps the hash chain valid under concurrent writers", async () => {
		const runId = "run-chain-concurrent";
		const writers = Array.from({ length: 4 }, (_, w) => async () => {
			for (let i = 0; i < 8; i++) {
				await appendRunEvent(testDir, runId, "agent.progress", { agentId: `w${w}`, progress: `e${w}-${i}` });
			}
		});
		await Promise.all(writers.map((w) => w()));

		const result = await verifyLedgerIntegrity(testDir, runId);
		expect(result.valid).toBe(true);
		expect(result.eventCount).toBe(32);
	}, 15000);

	it("keeps the hash chain valid under a heavy write burst", async () => {
		// Windows에서는 경합 중 open("wx")가 EEXIST 대신 일시적 EPERM/EACCES를
		// 반환하는 창이 있다(삭제-대기 전이). 락 획득이 이를 재시도하는지를
		// 경합 강도를 높여 검증한다 — 재시도가 없으면 이 테스트는 부하 아래에서
		// 확률적으로 실패한다.
		const runId = "run-chain-burst";
		const writers = Array.from({ length: 16 }, (_, w) => async () => {
			for (let i = 0; i < 10; i++) {
				await appendRunEvent(testDir, runId, "agent.progress", { agentId: `w${w}`, progress: `e${w}-${i}` });
			}
		});
		await Promise.all(writers.map((w) => w()));

		const result = await verifyLedgerIntegrity(testDir, runId);
		expect(result.valid).toBe(true);
		expect(result.eventCount).toBe(160);
	}, 15000);
});
