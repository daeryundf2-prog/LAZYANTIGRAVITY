import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateClaimLedger } from "../src/research-claims.js";
import { ulwLoopCommand } from "../src/cli-commands.js";

async function withTempDir(fn: (dir: string) => Promise<void>) {
	const dir = mkdtempSync(join(tmpdir(), "ulw-claims-test-"));
	try {
		await fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe("research-claims claim ledger verification", () => {
	it("passes a clean ledger with all requirements satisfied", async () => {
		await withTempDir(async (dir) => {
			const ledgerContent = `
# Research Claim Ledger

| Claim | Risk Level | Sources (2+ Domains) | Counter-Search Result | Primary Source | Status |
|---|---|---|---|---|---|
| [Claim 1] whisper.cpp compiles on macOS ARM64 | Low | https://github.com/ggerganov/whisper.cpp, https://news.ycombinator.com/item?id=123 | Search for "whisper.cpp apple silicon broken": no fatal blockers | https://github.com/ggerganov/whisper.cpp/releases/tag/v1.5.0 | VERIFIED |
| [Claim 2] Old Python 2 is deprecated | Low | https://python.org, https://en.wikipedia.org/wiki/Python | Confirmed no modern distribution ships py2 by default | https://peps.python.org/pep-0373/ | VERIFIED |
| [Claim 3] Jina Reader requires API key | Medium | https://jina.ai | Tested keyless: returned 200 OK | https://r.jina.ai | REFUTED |
| [Claim 4] Unresolved speculative topic | High | https://example.com | Not enough data | https://example.com/spec | UNRESOLVED |
`;
			writeFileSync(join(dir, "claim-ledger.md"), ledgerContent, "utf8");

			const synthesisContent = `
# Synthesis Report
According to [Claim 1], whisper.cpp works well. Also [Claim 2] is confirmed.
`;
			writeFileSync(join(dir, "SYNTHESIS.md"), synthesisContent, "utf8");

			const report = await validateClaimLedger(dir, {
				ledgerFile: "claim-ledger.md",
				synthesisFile: "SYNTHESIS.md",
			});

			expect(report.ok).toBe(true);
			expect(report.totalClaims).toBe(4);
			expect(report.verifiedCount).toBe(2);
			expect(report.refutedCount).toBe(1);
			expect(report.unresolvedCount).toBe(1);
			expect(report.violations.length).toBe(0);
		});
	});

	it("detects single-domain violation for a VERIFIED claim", async () => {
		await withTempDir(async (dir) => {
			const ledgerContent = `
| Claim | Risk Level | Sources (2+ Domains) | Counter-Search Result | Primary Source | Status |
|---|---|---|---|---|---|
| [Claim 1] Single domain claim | Medium | https://blog.example.com/a, https://docs.example.com/b | Counter-search performed: no contradiction | https://example.com/source | VERIFIED |
`;
			writeFileSync(join(dir, "claim-ledger.md"), ledgerContent, "utf8");

			const report = await validateClaimLedger(dir, {
				ledgerFile: "claim-ledger.md",
			});

			expect(report.ok).toBe(false);
			expect(report.violations.length).toBe(1);
			expect(report.violations[0]?.violation).toMatch(/Domain independence failed/);
		});
	});

	it("detects missing counter-search and missing primary source", async () => {
		await withTempDir(async (dir) => {
			const ledgerContent = `
| Claim | Risk Level | Sources (2+ Domains) | Counter-Search Result | Primary Source | Status |
|---|---|---|---|---|---|
| [Claim 1] Missing counter search | Low | https://github.com, https://reddit.com | n/a | https://github.com/repo | VERIFIED |
| [Claim 2] Missing primary source | Low | https://github.com, https://reddit.com | Searched counter: OK | — | VERIFIED |
`;
			writeFileSync(join(dir, "claim-ledger.md"), ledgerContent, "utf8");

			const report = await validateClaimLedger(dir, {
				ledgerFile: "claim-ledger.md",
			});

			expect(report.ok).toBe(false);
			expect(report.violations.length).toBe(2);
			expect(report.violations[0]?.violation).toMatch(/Counter-search missing/);
			expect(report.violations[1]?.violation).toMatch(/Primary source missing/);
		});
	});

	it("detects unverified or missing claim cited in SYNTHESIS.md", async () => {
		await withTempDir(async (dir) => {
			const ledgerContent = `
| Claim | Risk Level | Sources (2+ Domains) | Counter-Search Result | Primary Source | Status |
|---|---|---|---|---|---|
| [Claim 1] Valid verified claim | Low | https://a.com, https://b.com | Counter-searched: none | https://a.com/spec | VERIFIED |
| [Claim 2] Refuted claim | High | https://c.com, https://d.com | Counter-searched: refuted | https://c.com/spec | REFUTED |
`;
			writeFileSync(join(dir, "claim-ledger.md"), ledgerContent, "utf8");

			const synthesisContent = `
We rely on [Claim 1] and [Claim 2] and [Claim 99].
`;
			writeFileSync(join(dir, "SYNTHESIS.md"), synthesisContent, "utf8");

			const report = await validateClaimLedger(dir, {
				ledgerFile: "claim-ledger.md",
				synthesisFile: "SYNTHESIS.md",
			});

			expect(report.ok).toBe(false);
			expect(report.violations.some((v) => v.claimId === "Claim 2" && v.violation.includes("status is REFUTED"))).toBe(true);
			expect(report.violations.some((v) => v.claimId === "Claim 99" && v.violation.includes("not found"))).toBe(true);
		});
	});

	it("CLI enforce flag returns exit code 1 on violations and 0 on pass", async () => {
		await withTempDir(async (dir) => {
			const cleanLedger = `
| Claim | Risk Level | Sources (2+ Domains) | Counter-Search Result | Primary Source | Status |
|---|---|---|---|---|---|
| [Claim 1] Good claim | Low | https://a.org, https://b.io | Counter search done | https://a.org/doc | VERIFIED |
`;
			writeFileSync(join(dir, "clean.md"), cleanLedger, "utf8");

			const badLedger = `
| Claim | Risk Level | Sources (2+ Domains) | Counter-Search Result | Primary Source | Status |
|---|---|---|---|---|---|
| [Claim 1] Bad claim | Low | https://a.org | n/a | — | VERIFIED |
`;
			writeFileSync(join(dir, "bad.md"), badLedger, "utf8");

			// Clean with --enforce -> 0
			const exitClean = await ulwLoopCommand([
				"research-claims",
				"--file",
				join(dir, "clean.md"),
				"--enforce",
				"--json",
			]);
			expect(exitClean).toBe(0);

			// Bad without --enforce -> 0 (report only)
			const exitBadReport = await ulwLoopCommand([
				"research-claims",
				"--file",
				join(dir, "bad.md"),
				"--json",
			]);
			expect(exitBadReport).toBe(0);

			// Bad with --enforce -> 1
			const exitBadEnforce = await ulwLoopCommand([
				"research-claims",
				"--file",
				join(dir, "bad.md"),
				"--enforce",
				"--json",
			]);
			expect(exitBadEnforce).toBe(1);
		});
	});
});
