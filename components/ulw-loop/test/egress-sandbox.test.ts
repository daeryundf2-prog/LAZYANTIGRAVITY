import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatchConsensus, OpenCodeLiveConsensusClient } from "../src/consensus-dispatcher.js";
import { appendRunEvent, readRunEvents } from "../src/control-plane.js";
import { auditEgressRequest } from "../src/network-sandbox.js";

describe("auditEgressRequest", () => {
	it("allows loopback and default infra domains", () => {
		expect(auditEgressRequest("http://127.0.0.1:4096").allowed).toBe(true);
		expect(auditEgressRequest("http://localhost:8080").allowed).toBe(true);
		expect(auditEgressRequest("https://api.github.com/x").allowed).toBe(true);
		expect(auditEgressRequest("https://sub.generativelanguage.googleapis.com/").allowed).toBe(true);
	});

	it("blocks unlisted remote domains", () => {
		const result = auditEgressRequest("https://exfil.example.com/api");
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain("exfil.example.com");
	});

	it("blocks malformed URLs and lookalike domains", () => {
		expect(auditEgressRequest("not-a-url").allowed).toBe(false);
		expect(auditEgressRequest("https://github.com.evil.com/").allowed).toBe(false);
	});

	it("honors a custom whitelist for self-hosted endpoints", () => {
		const allowed = auditEgressRequest("https://opencode.internal.corp", ["internal.corp"]);
		expect(allowed.allowed).toBe(true);
	});
});

describe("OpenCodeLiveConsensusClient egress gate", () => {
	it("blocks remote baseUrl before the SDK is touched", async () => {
		// given — SDK가 없어도 되는 검증: 감사가 import보다 먼저다
		const client = new OpenCodeLiveConsensusClient("https://exfil.example.com");
		// when / then
		await expect(client.init()).rejects.toThrow("Consensus egress blocked");
	});

	it("passes loopback through to the SDK stage", async () => {
		const client = new OpenCodeLiveConsensusClient("http://127.0.0.1:4096");
		// SDK가 설치돼 있으면 init 성공, 없으면 import 오류 — 어느 쪽이든 egress 오류가 아니다
		try {
			await client.init();
		} catch (error) {
			expect(String(error)).not.toContain("egress");
		}
	});

	it("accepts a remote URL only via explicit whitelist", async () => {
		const client = new OpenCodeLiveConsensusClient("https://opencode.internal.corp", ["internal.corp"]);
		try {
			await client.init();
		} catch (error) {
			expect(String(error)).not.toContain("egress");
		}
	});
});

describe("dispatchConsensus egress enforcement", () => {
	let repoRoot: string;
	const runId = "test-egress-run";

	beforeEach(async () => {
		repoRoot = mkdtempSync(join(tmpdir(), "egress-sandbox-"));
		await appendRunEvent(repoRoot, runId, "run.created", {});
	});

	afterEach(() => {
		if (repoRoot && existsSync(repoRoot)) rmSync(repoRoot, { recursive: true, force: true });
	});

	it("throws and writes a ledger event when live consensus targets a blocked domain", async () => {
		// given — live 모드 + 차단 도메인
		// when
		await expect(
			dispatchConsensus(repoRoot, runId, "fp-egress", {
				live: true,
				prompt: "audit this",
				opencodeBaseUrl: "https://exfil.example.com",
			}),
		).rejects.toThrow("Consensus egress blocked");
		// then — 원장에 차단 이벤트가 남는다
		const events = await readRunEvents(repoRoot, runId);
		const blocked = events.find((e) => e.type === "quality_gate.consensus_egress_blocked");
		expect(blocked).toBeDefined();
		expect(blocked?.reason).toContain("exfil.example.com");
	});

	it("honors OMO_ULW_LOOP_EGRESS_ALLOW for self-hosted servers", async () => {
		process.env["OMO_ULW_LOOP_EGRESS_ALLOW"] = "internal.corp";
		try {
			// SDK 부재로 init이 실패할 수 있으나 egress로는 실패하지 않는다
			await dispatchConsensus(repoRoot, runId, "fp-egress-ok", {
				live: true,
				prompt: "audit this",
				opencodeBaseUrl: "https://opencode.internal.corp",
			}).catch((error: unknown) => {
				expect(String(error)).not.toContain("EGRESS_BLOCKED");
			});
			const events = await readRunEvents(repoRoot, runId);
			expect(events.find((e) => e.type === "quality_gate.consensus_egress_blocked")).toBeUndefined();
		} finally {
			delete process.env["OMO_ULW_LOOP_EGRESS_ALLOW"];
		}
	});
});
