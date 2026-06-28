import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
	criteriaSummary,
	markCriteriaPendingResetForGoal,
	recordEvidence,
	unresolvedCriteriaOf,
} from "../src/evidence.js";
import { physicalEvidenceFreshness } from "../src/evidence-verifier.js";
import { ulwLoopDir } from "../src/paths.js";
import { readUlwLoopPlan, writePlan } from "../src/plan-io.js";
import type { UlwLoopItem, UlwLoopLedgerEntry, UlwLoopPlan, UlwLoopSuccessCriterion } from "../src/types.js";
import { UlwLoopError } from "../src/types.js";

const NOW = "2026-05-23T00:00:00.000Z";
const TRUSTED_MANIFEST_KIND = "ulw-loop.evidence-capture.v1";

type TrustedEvidenceFixture = {
	readonly evidence: string;
	readonly artifactPath: string;
	readonly manifestPath: string;
};

async function bootstrapRepo(plan: UlwLoopPlan): Promise<string> {
	const repo = await mkdtemp(join(tmpdir(), "ug-evidence-"));
	await mkdir(ulwLoopDir(repo), { recursive: true });
	await writePlan(repo, plan);
	return repo;
}

function evidenceFilePath(repo: string, name: string): string {
	const dir = join(repo, ".omo", "ulw-loop", "evidence");
	mkdirSync(dir, { recursive: true });
	return join(dir, name);
}

function sha256Hex(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function trustedEvidenceFixture(
	repo: string,
	name: string,
	content = "tests passed",
	overrides: Record<string, unknown> = {},
): TrustedEvidenceFixture {
	const artifactPath = evidenceFilePath(repo, name);
	const manifestPath = evidenceFilePath(repo, `${name}.manifest.json`);
	writeFileSync(artifactPath, content);
	writeFileSync(
		manifestPath,
		`${JSON.stringify(
			{
				version: 1,
				kind: TRUSTED_MANIFEST_KIND,
				command: ["node", "--test"],
				cwd: repo,
				exitCode: 0,
				exitSignal: null,
				startedAt: new Date().toISOString(),
				endedAt: new Date().toISOString(),
				durationMs: 1,
				artifactPath,
				artifactSha256: sha256Hex(content),
				nonce: `${name}-nonce`,
				captureTool: "omo-ulw-loop capture-evidence",
				...overrides,
			},
			null,
			2,
		)}\n`,
	);
	return { evidence: pathToFileURL(manifestPath).href, artifactPath, manifestPath };
}

function trustedEvidenceUrl(repo: string, name: string, content = "tests passed"): string {
	return trustedEvidenceFixture(repo, name, content).evidence;
}

async function readLastLedgerEntry(repo: string): Promise<UlwLoopLedgerEntry> {
	const lines = (await readFile(join(repo, ".omo/ulw-loop/ledger.jsonl"), "utf8")).trim().split("\n");
	const last = lines.at(-1);
	if (last === undefined) throw new Error("expected ledger entry");
	return JSON.parse(last);
}

function firstGoal(plan: UlwLoopPlan): UlwLoopItem {
	const goal = plan.goals.at(0);
	if (goal === undefined) throw new Error("expected goal");
	return goal;
}

function makeCriterion(overrides: Partial<UlwLoopSuccessCriterion> = {}): UlwLoopSuccessCriterion {
	return {
		id: "C001",
		scenario: "happy path login returns 200",
		userModel: "happy",
		expectedEvidence: "curl /login -d {valid} returns 200 + token",
		capturedEvidence: null,
		status: "pending",
		...overrides,
	};
}

function makeGoal(overrides: Partial<UlwLoopItem> = {}): UlwLoopItem {
	return {
		id: "G001",
		title: "Auth endpoint",
		objective: "Build JWT auth",
		status: "in_progress",
		successCriteria: [
			makeCriterion({ id: "C001" }),
			makeCriterion({ id: "C002", userModel: "edge" }),
			makeCriterion({ id: "C003", userModel: "regression" }),
		],
		attempt: 1,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	};
}

function makePlan(overrides: Partial<UlwLoopPlan> = {}): UlwLoopPlan {
	return {
		version: 1,
		createdAt: NOW,
		updatedAt: NOW,
		briefPath: ".omo/ulw-loop/brief.md",
		goalsPath: ".omo/ulw-loop/goals.json",
		ledgerPath: ".omo/ulw-loop/ledger.jsonl",
		codexGoalMode: "aggregate",
		codexObjective: "Complete the durable ulw-loop plan in .omo/ulw-loop/goals.json",
		codexObjectiveAliases: [],
		goals: [makeGoal()],
		...overrides,
	};
}

describe("recordEvidence (status=pass)", () => {
	it("sets criterion.status=pass + capturedEvidence + capturedAt", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "pass-captured.txt", "curl /login returns 200 + token verified");

		const result = await recordEvidence(repo, {
			goalId: "G001",
			criterionId: "C001",
			status: "pass",
			evidence: fixture.evidence,
		});

		expect(result.criterion.status).toBe("pass");
		expect(result.criterion.capturedEvidence).toContain(fixture.manifestPath);
		await expect(readFile(fixture.artifactPath, "utf8")).resolves.toContain("curl /login returns 200");
		expect(result.criterion.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("appends evidence_captured ledger event", async () => {
		const repo = await bootstrapRepo(makePlan());
		const evidence = trustedEvidenceUrl(repo, "ledger-pass.txt");

		await recordEvidence(repo, { goalId: "G001", criterionId: "C001", status: "pass", evidence });

		const last = await readLastLedgerEntry(repo);
		expect(last.kind).toBe("evidence_captured");
		expect(last.goalId).toBe("G001");
		expect(last.criterionId).toBe("C001");
	});

	it("persists the change so a fresh read sees status=pass", async () => {
		const repo = await bootstrapRepo(makePlan());
		const evidence = trustedEvidenceUrl(repo, "persisted-pass.txt");

		await recordEvidence(repo, { goalId: "G001", criterionId: "C001", status: "pass", evidence });

		const criterion = firstGoal(await readUlwLoopPlan(repo)).successCriteria.find((c) => c.id === "C001");
		expect(criterion?.status).toBe("pass");
	});
});

describe("recordEvidence (status=fail)", () => {
	it("sets criterion.status=fail + appends criterion_failed event", async () => {
		const repo = await bootstrapRepo(makePlan());

		const result = await recordEvidence(repo, {
			goalId: "G001",
			criterionId: "C001",
			status: "fail",
			evidence: "got 500 not 200",
		});

		expect(result.criterion.status).toBe("fail");
		expect((await readLastLedgerEntry(repo)).kind).toBe("criterion_failed");
	});
});

describe("recordEvidence (status=blocked)", () => {
	it("sets criterion.status=blocked + appends criterion_blocked event", async () => {
		const repo = await bootstrapRepo(makePlan());

		const result = await recordEvidence(repo, {
			goalId: "G001",
			criterionId: "C001",
			status: "blocked",
			evidence: "auth not in CI yet",
		});

		expect(result.criterion.status).toBe("blocked");
		expect((await readLastLedgerEntry(repo)).kind).toBe("criterion_blocked");
	});
});

describe("recordEvidence error cases", () => {
	it("throws when goalId not found", async () => {
		const repo = await bootstrapRepo(makePlan());

		await expect(
			recordEvidence(repo, { goalId: "GUNKNOWN", criterionId: "C001", status: "pass", evidence: "x" }),
		).rejects.toBeInstanceOf(UlwLoopError);
	});

	it("throws when criterionId not found within goal", async () => {
		const repo = await bootstrapRepo(makePlan());

		await expect(
			recordEvidence(repo, { goalId: "G001", criterionId: "CUNKNOWN", status: "pass", evidence: "x" }),
		).rejects.toBeInstanceOf(UlwLoopError);
	});

	it("throws when evidence is empty/whitespace", async () => {
		const repo = await bootstrapRepo(makePlan());

		await expect(
			recordEvidence(repo, { goalId: "G001", criterionId: "C001", status: "pass", evidence: "   " }),
		).rejects.toBeInstanceOf(UlwLoopError);
	});

	it("throws when passing evidence does not include a physical file artifact", async () => {
		const repo = await bootstrapRepo(makePlan());

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: "observable proof without file artifact",
			}),
		).rejects.toThrow("Passing evidence must include a trusted capture manifest file:// artifact");
	});
});

describe("markCriteriaPendingResetForGoal", () => {
	it("resets every criterion of the goal to pending + capturedEvidence=null", async () => {
		const goal = makeGoal({
			successCriteria: [
				makeCriterion({ id: "C001", status: "pass", capturedEvidence: "old" }),
				makeCriterion({ id: "C002", status: "fail", capturedEvidence: "older" }),
				makeCriterion({ id: "C003", status: "blocked", capturedEvidence: "oldest" }),
			],
		});
		const repo = await bootstrapRepo(makePlan({ goals: [goal] }));

		const result = await markCriteriaPendingResetForGoal(repo, "G001");

		expect(result.resetCount).toBe(3);
		for (const c of firstGoal(result.plan).successCriteria) {
			expect(c.status).toBe("pending");
			expect(c.capturedEvidence).toBeNull();
		}
	});

	it("appends a single criteria_revised ledger event describing the reset", async () => {
		const repo = await bootstrapRepo(makePlan());

		await markCriteriaPendingResetForGoal(repo, "G001");

		expect((await readLastLedgerEntry(repo)).kind).toBe("criteria_revised");
	});
});

describe("criteriaSummary (pure)", () => {
	it("aggregates counts across all goals", () => {
		const plan = makePlan({
			goals: [
				makeGoal({
					id: "G001",
					successCriteria: [
						makeCriterion({ id: "C001", status: "pass" }),
						makeCriterion({ id: "C002", status: "pending" }),
					],
				}),
				makeGoal({
					id: "G002",
					successCriteria: [
						makeCriterion({ id: "C001", status: "fail" }),
						makeCriterion({ id: "C002", status: "blocked" }),
						makeCriterion({ id: "C003", status: "pass" }),
					],
				}),
			],
		});

		const summary = criteriaSummary(plan);

		expect(summary.totalCriteria).toBe(5);
		expect(summary.passCount).toBe(2);
		expect(summary.pendingCount).toBe(1);
		expect(summary.failCount).toBe(1);
		expect(summary.blockedCount).toBe(1);
		expect(summary.goalsWithUnresolvedCriteria).toEqual(["G001", "G002"]);
	});

	it("returns empty when no criteria exist", () => {
		const summary = criteriaSummary(makePlan({ goals: [makeGoal({ successCriteria: [] })] }));

		expect(summary.totalCriteria).toBe(0);
		expect(summary.goalsWithUnresolvedCriteria).toEqual([]);
	});
});

describe("unresolvedCriteriaOf (pure)", () => {
	it("returns only non-pass criteria", () => {
		const goal = makeGoal({
			successCriteria: [
				makeCriterion({ id: "C001", status: "pass" }),
				makeCriterion({ id: "C002", status: "pending" }),
				makeCriterion({ id: "C003", status: "fail" }),
			],
		});

		const unresolved = unresolvedCriteriaOf(goal);

		expect(unresolved.map((c) => c.id)).toEqual(["C002", "C003"]);
	});
});

describe("recordEvidence physical matching verification", () => {
	it("throws when physical evidence file path is specified but does not exist", async () => {
		const repo = await bootstrapRepo(makePlan());

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: "file:///nonexistent-evidence-file.txt",
			}),
		).rejects.toThrow("Trusted evidence manifest not found");
	});

	it("throws when trusted evidence manifest is outdated (> 30s)", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "outdated-evidence.txt", "success criteria passed");
		const time = (Date.now() - 60000) / 1000;
		utimesSync(fixture.manifestPath, time, time);

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow("Trusted evidence manifest is outdated");
	});

	it("throws when captured evidence artifact contains failure/error keyword", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "error-evidence.txt", "TypeError: invalid arguments passed to auth");

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow("Captured evidence artifact contains error/failure keyword");
	});

	it("succeeds when trusted evidence manifest and artifact are valid and recent", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "valid-evidence.txt", "JUnit Tests passed! failed: 0, errors: 0");

		const result = await recordEvidence(repo, {
			goalId: "G001",
			criterionId: "C001",
			status: "pass",
			evidence: fixture.evidence,
		});

		expect(result.criterion.status).toBe("pass");
		expect(result.criterion.capturedEvidence).toContain(fixture.evidence);
	});

	it("accepts a trusted evidence manifest URL whose path contains spaces", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "valid evidence with spaces.txt", "tests passed");

		const result = await recordEvidence(repo, {
			goalId: "G001",
			criterionId: "C001",
			status: "pass",
			evidence: `${fixture.evidence} | cleanup: none`,
		});

		expect(result.criterion.status).toBe("pass");
		expect(result.criterion.capturedEvidence).toContain(fixture.evidence);
	});

	it("uses filesystem time instead of Date.now for physical evidence freshness", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "clock-drift-evidence.txt", "tests passed");
		const now = Date.now();
		const clockSpy = vi.spyOn(Date, "now").mockReturnValue(now + 60000);

		try {
			const result = await recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			});

			expect(result.criterion.status).toBe("pass");
		} finally {
			clockSpy.mockRestore();
		}
	});

	it("accepts common zero-failure test log phrases", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(
			repo,
			"zero-failure-evidence.txt",
			"No failures found\n0 tests failed\nfailure count: 0\nerror count: 0\n",
		);

		const result = await recordEvidence(repo, {
			goalId: "G001",
			criterionId: "C001",
			status: "pass",
			evidence: fixture.evidence,
		});

		expect(result.criterion.status).toBe("pass");
	});

	it("still rejects nonzero failure counts in physical evidence", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "nonzero-failure-evidence.txt", "1 test failed\n");

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow('Captured evidence artifact contains error/failure keyword: "fail"');
	});

	it("rejects trusted evidence manifest outside the ulw-loop evidence directory", async () => {
		const repo = await bootstrapRepo(makePlan());
		const file = join(repo, "outside-evidence.txt");
		writeFileSync(file, "tests passed");

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: pathToFileURL(file).href,
			}),
		).rejects.toThrow("Trusted evidence manifest must be inside .omo/ulw-loop/evidence");
	});

	it("rejects a raw log file even when it is fresh and inside the evidence directory", async () => {
		const repo = await bootstrapRepo(makePlan());
		const file = evidenceFilePath(repo, "raw-log.txt");
		writeFileSync(file, "tests passed");

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: pathToFileURL(file).href,
			}),
		).rejects.toThrow("Trusted evidence manifest is invalid JSON");
	});

	it("rejects a trusted manifest whose artifact hash was tampered", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "tampered-hash.txt", "tests passed");
		writeFileSync(fixture.artifactPath, "tests passed after tamper");

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow("Captured evidence artifact hash does not match");
	});

	it("rejects a trusted manifest captured from a failed command", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "failed-command.txt", "command output", { exitCode: 1 });

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow("Trusted evidence command exited with code 1");
	});

	it("rejects a trusted manifest whose artifact path escapes the evidence directory", async () => {
		const repo = await bootstrapRepo(makePlan());
		const outside = join(repo, "outside-artifact.log");
		writeFileSync(outside, "tests passed");
		const fixture = trustedEvidenceFixture(repo, "artifact-escape.txt", "tests passed", {
			artifactPath: outside,
			artifactSha256: sha256Hex("tests passed"),
		});

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow("Captured evidence artifact must be inside .omo/ulw-loop/evidence");
	});

	it("rejects a trusted manifest captured for a different repository root", async () => {
		const repo = await bootstrapRepo(makePlan());
		const otherRepo = await mkdtemp(join(tmpdir(), "ug-evidence-other-"));
		const fixture = trustedEvidenceFixture(repo, "wrong-cwd.txt", "tests passed", { cwd: otherRepo });

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow("Trusted evidence manifest cwd does not match this repository");
	});

	it("rejects obfuscated failure keywords in physical evidence", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(
			repo,
			"obfuscated-failure-evidence.txt",
			"F-a-i-l: assertion did not match\n",
		);

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow('Captured evidence artifact contains error/failure keyword: "fail"');
	});

	it("rejects unicode-normalized obfuscated failure keywords in physical evidence", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(
			repo,
			"unicode-obfuscated-failure-evidence.txt",
			"Ｆ-Ａ-Ｉ-Ｌ: assertion did not match\n",
		);

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: fixture.evidence,
			}),
		).rejects.toThrow('Captured evidence artifact contains error/failure keyword: "fail"');
	});

	it("rejects a symlinked trusted evidence manifest that escapes the evidence directory", async () => {
		const repo = await bootstrapRepo(makePlan());
		const outside = join(repo, "outside-target.log");
		const link = evidenceFilePath(repo, "escaping-symlink.log");
		writeFileSync(outside, "{}");
		symlinkSync(outside, link);

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: pathToFileURL(link).href,
			}),
		).rejects.toThrow("Trusted evidence manifest must be inside .omo/ulw-loop/evidence");
	});

	it("rejects physical evidence when the evidence directory itself is a symlink escape", async () => {
		const repo = await bootstrapRepo(makePlan());
		const outsideDir = join(repo, "outside-evidence-dir");
		const evidenceDir = join(repo, ".omo", "ulw-loop", "evidence");
		mkdirSync(outsideDir);
		symlinkSync(outsideDir, evidenceDir, "dir");
		const file = join(evidenceDir, "pass.log.manifest.json");
		writeFileSync(file, "{}");

		await expect(
			recordEvidence(repo, {
				goalId: "G001",
				criterionId: "C001",
				status: "pass",
				evidence: pathToFileURL(file).href,
			}),
		).rejects.toThrow("Trusted evidence manifest must be inside .omo/ulw-loop/evidence");
	});

	it("reports unavailable creation time as not fresh enough to trust", () => {
		const reference = 1000;

		const freshness = physicalEvidenceFreshness({ birthtimeMs: 0, mtimeMs: reference }, reference);

		expect(freshness.createdAgeInMs).toBeNull();
		expect(freshness.modifiedAgeInMs).toBe(0);
	});

	it("does not leave clock anchor artifacts after physical evidence verification", async () => {
		const repo = await bootstrapRepo(makePlan());
		const fixture = trustedEvidenceFixture(repo, "anchor-cleanup-evidence.txt", "tests passed");

		await recordEvidence(repo, {
			goalId: "G001",
			criterionId: "C001",
			status: "pass",
			evidence: fixture.evidence,
		});

		const ulwFiles = readdirSync(join(repo, ".omo", "ulw-loop"));
		expect(ulwFiles.filter((name) => name.startsWith(".evidence-clock-anchor"))).toEqual([]);
	});
});
