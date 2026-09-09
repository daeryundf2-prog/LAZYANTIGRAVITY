import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertGateUnlocked, assertGroundTruthEvidence } from "../src/evidence-completion-gate.js";
import type { StrictEvidenceEnvelope } from "../src/evidence-contract.js";
import { verifyEvidenceGroundTruth } from "../src/evidence-verifier.js";
import { ulwLoopGateFailedPath } from "../src/paths.js";
import { verifyWalkthroughGroundTruth } from "../src/walkthrough-verifier.js";

let testDir: string;

afterEach(() => {
	if (testDir && existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

describe("Freshness, Placeholder, and Data Flow Lock Gates", () => {
	it("rejects evidence receipts with fewer than 40 chars as placeholders", () => {
		testDir = mkdtempSync(join(tmpdir(), "freshness-test-"));
		mkdirSync(join(testDir, ".omo", "evidence"), { recursive: true });
		const receiptPath = join(testDir, ".omo", "evidence", "test_report.log");
		writeFileSync(receiptPath, "too short", "utf8");

		const envelope: StrictEvidenceEnvelope = {
			status: "verified",
			summary: "Comprehensive unit and integration test verification passed with full output.",
			readRanges: [{ file: ".omo/evidence/test_report.log", startLine: 1, endLine: 1 }],
			commandsRun: ["npm test"],
			commandAudits: [{ command: "npm test", exitCode: 0 }],
		};

		const result = verifyEvidenceGroundTruth(testDir, envelope);
		expect(result.verified).toBe(false);
		expect(result.placeholderReceipts?.length).toBeGreaterThan(0);
		expect(result.placeholderReceipts?.[0]).toContain("Placeholder evidence receipt (< 40 chars)");
	});

	it("rejects evidence receipts modified before runStartedAtMs as stale", () => {
		testDir = mkdtempSync(join(tmpdir(), "stale-test-"));
		mkdirSync(join(testDir, ".omo", "evidence"), { recursive: true });
		const receiptPath = join(testDir, ".omo", "evidence", "test_report.log");
		writeFileSync(
			receiptPath,
			"PASS: All 45 integration tests passed cleanly with exit code 0 and zero regressions.",
			"utf8",
		);

		// Age file to 1 hour ago
		const pastTime = (Date.now() - 3600000) / 1000;
		utimesSync(receiptPath, pastTime, pastTime);

		const envelope: StrictEvidenceEnvelope = {
			status: "verified",
			summary: "Comprehensive unit and integration test verification passed with full output.",
			readRanges: [{ file: ".omo/evidence/test_report.log", startLine: 1, endLine: 1 }],
			commandsRun: ["npm test"],
			commandAudits: [{ command: "npm test", exitCode: 0 }],
			runStartedAtMs: Date.now() - 60000, // run started 1 minute ago
		};

		const result = verifyEvidenceGroundTruth(testDir, envelope);
		expect(result.verified).toBe(false);
		expect(result.staleReceipts?.length).toBeGreaterThan(0);
		expect(result.staleReceipts?.[0]).toContain("Stale evidence receipt");
	});

	it("creates gate_failed.json on verification failure and locks completion gate", async () => {
		testDir = mkdtempSync(join(tmpdir(), "gate-lock-test-"));
		mkdirSync(join(testDir, ".omo", "ulw-loop"), { recursive: true });

		const invalidEnvelope = JSON.stringify({
			evidenceContract: {
				status: "verified",
				summary: "Valid summary with sufficient characters but missing commands and files",
				readRanges: [],
				fileChecksums: [],
				commandsRun: [],
				commandAudits: [],
			},
		});

		await expect(assertGroundTruthEvidence(testDir, invalidEnvelope, [])).rejects.toThrow();

		const gateFailedFile = ulwLoopGateFailedPath(testDir);
		expect(existsSync(gateFailedFile)).toBe(true);

		// assertGateUnlocked should throw
		expect(() => assertGateUnlocked(testDir)).toThrowError(/Quality gate is locked/);
	});

	it("verifies walkthrough.md and catches phantom file/command claims", () => {
		testDir = mkdtempSync(join(tmpdir(), "walkthrough-test-"));
		const walkthroughContent = `# Walkthrough
## Proposed Changes
### Core
#### [MODIFY] src/real.ts
#### [NEW] src/phantom_ghost.ts

## Verification Plan
\`\`\`bash
npm run phantom-test
\`\`\`
`;
		writeFileSync(join(testDir, "walkthrough.md"), walkthroughContent, "utf8");

		const result = verifyWalkthroughGroundTruth(testDir, "walkthrough.md", [
			{
				eventId: "ev-1",
				runId: "r1",
				timestamp: new Date().toISOString(),
				type: "agent.completed_reported",
				result: {
					filesChanged: ["src/real.ts"],
					commandsRun: ["npm test"],
				},
			},
		]);

		expect(result.ok).toBe(false);
		expect(result.phantomFiles).toContain("src/phantom_ghost.ts");
		expect(result.phantomCommands).toContain("npm run phantom-test");
	});

	it("skips walkthrough verification when no ledger events exist instead of passing everything", () => {
		testDir = mkdtempSync(join(tmpdir(), "walkthrough-skip-"));
		writeFileSync(
			join(testDir, "walkthrough.md"),
			"# Walkthrough\n#### [MODIFY] src/anything.ts\n```bash\nnpm run never-ran\n```\n",
			"utf8",
		);

		const result = verifyWalkthroughGroundTruth(testDir, "walkthrough.md", []);
		expect(result.ok).toBe(true);
		expect(result.skipped).toBe(true);
		expect(result.claimedCommands.length).toBe(0);
	});

	it("does not pass unattested commands via substring match against attested commands", () => {
		testDir = mkdtempSync(join(tmpdir(), "walkthrough-substr-"));
		writeFileSync(join(testDir, "walkthrough.md"), "# Verification\n```bash\nnpm test\n```\n", "utf8");

		const result = verifyWalkthroughGroundTruth(testDir, "walkthrough.md", [
			{
				eventId: "ev-1",
				runId: "r1",
				timestamp: new Date().toISOString(),
				type: "agent.completed_reported",
				result: {
					commandsRun: ["echo hello && npm test -- --coverage"],
				},
			},
		]);

		expect(result.ok).toBe(false);
		expect(result.phantomCommands).toContain("npm test");
	});

	it("locks the quality gate when a previous verification failed and gate_failed.json exists", () => {
		testDir = mkdtempSync(join(tmpdir(), "gate-lock-entry-"));
		mkdirSync(join(testDir, ".omo", "ulw-loop"), { recursive: true });
		writeFileSync(
			ulwLoopGateFailedPath(testDir),
			JSON.stringify({
				failedAt: new Date().toISOString(),
				error: "previous failure",
				code: "ULW_LOOP_MECHANICAL_FAILED",
			}),
			"utf8",
		);

		expect(() => assertGateUnlocked(testDir)).toThrowError(/Quality gate is locked/);
	});
});
