import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ulwLoopCommand } from "../src/cli-commands.ts";

let testDir: string;
let out: string[];
let err: string[];
let originalCodexSessionId: string | undefined;
let originalCodexThreadId: string | undefined;
let originalOmoSessionId: string | undefined;
let evidenceCounter = 0;
const TRUSTED_MANIFEST_KIND = "ulw-loop.evidence-capture.v1";

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), "ug-cli-"));
	out = [];
	err = [];
	originalCodexSessionId = process.env["CODEX_SESSION_ID"];
	originalCodexThreadId = process.env["CODEX_THREAD_ID"];
	originalOmoSessionId = process.env["OMO_ULW_LOOP_SESSION_ID"];
	delete process.env["CODEX_SESSION_ID"];
	delete process.env["CODEX_THREAD_ID"];
	delete process.env["OMO_ULW_LOOP_SESSION_ID"];
	vi.spyOn(process, "cwd").mockReturnValue(testDir);
	vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
		out.push(chunk.toString());
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
		err.push(chunk.toString());
		return true;
	});
});

afterEach(async () => {
	vi.restoreAllMocks();
	if (originalCodexSessionId === undefined) delete process.env["CODEX_SESSION_ID"];
	else process.env["CODEX_SESSION_ID"] = originalCodexSessionId;
	if (originalCodexThreadId === undefined) delete process.env["CODEX_THREAD_ID"];
	else process.env["CODEX_THREAD_ID"] = originalCodexThreadId;
	if (originalOmoSessionId === undefined) delete process.env["OMO_ULW_LOOP_SESSION_ID"];
	else process.env["OMO_ULW_LOOP_SESSION_ID"] = originalOmoSessionId;
	await rm(testDir, { recursive: true, force: true });
});

function resetOutput(): void {
	out = [];
	err = [];
}
function stdoutJson(): Record<string, unknown> {
	return JSON.parse(out.join(""));
}

async function createPlan(brief = "- Goal A\n- Goal B"): Promise<Record<string, unknown>> {
	resetOutput();
	expect(await ulwLoopCommand(["create-goals", "--brief", brief, "--json"])).toBe(0);
	const parsed = stdoutJson();
	resetOutput();
	return parsed;
}

async function passingEvidenceUrl(label: string): Promise<string> {
	const evidenceDir = join(testDir, ".omo/ulw-loop/evidence");
	await mkdir(evidenceDir, { recursive: true });
	const evidencePath = join(evidenceDir, `${label}-${++evidenceCounter}.log`);
	const manifestPath = `${evidencePath}.manifest.json`;
	const content = `${label} passed\n`;
	const hash = createHash("sha256").update(content).digest("hex");
	await writeFile(evidencePath, `${label} passed\n`, "utf8");
	await writeFile(
		manifestPath,
		`${JSON.stringify(
			{
				version: 1,
				kind: TRUSTED_MANIFEST_KIND,
				command: ["node", "--test"],
				cwd: testDir,
				exitCode: 0,
				exitSignal: null,
				startedAt: new Date().toISOString(),
				endedAt: new Date().toISOString(),
				durationMs: 1,
				artifactPath: evidencePath,
				artifactSha256: hash,
				nonce: `${label}-${evidenceCounter}`,
				captureTool: "omo-ulw-loop capture-evidence",
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	return pathToFileURL(manifestPath).href;
}

describe("ulwLoopCommand help", () => {
	it("prints usage when no subcommand", async () => {
		expect(await ulwLoopCommand([])).toBe(0);
		expect(out.join("")).toContain("omo ulw-loop");
	});
});

describe("ulwLoopCommand status", () => {
	it("prints plan summary including criteria counts", async () => {
		await createPlan();

		expect(await ulwLoopCommand(["status"])).toBe(0);
		expect(out.join("")).toContain("criteria: 0/6 pass");
	});
});

describe("ulwLoopCommand record-evidence", () => {
	it("records evidence + returns updated criterion", async () => {
		await createPlan();
		const evidenceUrl = await passingEvidenceUrl("curl-passed");

		expect(
			await ulwLoopCommand([
				"record-evidence",
				"--goal-id",
				"G001-goal-a",
				"--criterion-id",
				"C001",
				"--status",
				"pass",
				"--evidence",
				evidenceUrl,
				"--json",
			]),
		).toBe(0);
		expect(stdoutJson()).toMatchObject({
			ok: true,
			criterion: { id: "C001", status: "pass", capturedEvidence: evidenceUrl },
		});
	});

	it("returns 1 + error on unknown goal-id", async () => {
		await createPlan();

		expect(
			await ulwLoopCommand([
				"record-evidence",
				"--goal-id",
				"G404",
				"--criterion-id",
				"C001",
				"--status",
				"pass",
				"--evidence",
				"x",
			]),
		).toBe(1);
		expect(err.join("")).toContain("[ulw-loop]");
	});

	it("returns 1 + error on missing flags", async () => {
		expect(
			await ulwLoopCommand(["record-evidence", "--criterion-id", "C001", "--status", "pass", "--evidence", "x"]),
		).toBe(1);
		expect(err.join("")).toContain("Missing --goal-id");
	});
});

describe("ulwLoopCommand capture-evidence", () => {
	it("runs a command and writes a trusted manifest for record-evidence", async () => {
		await createPlan();
		const scriptPath = join(testDir, "proof.mjs");
		const outputPath = join(testDir, ".omo/ulw-loop/evidence/capture-proof.log");
		await writeFile(scriptPath, "console.log('capture proof passed')\n", "utf8");

		expect(
			await ulwLoopCommand([
				"capture-evidence",
				"--output",
				outputPath,
				"--json",
				"--",
				process.execPath,
				scriptPath,
			]),
		).toBe(0);
		const captured = stdoutJson();
		expect(captured).toMatchObject({ ok: true, exitCode: 0, artifactPath: await realpath(outputPath) });
		const evidenceFiles = await readdir(join(testDir, ".omo/ulw-loop/evidence"));
		expect(evidenceFiles.some((name) => name.endsWith(".tmp"))).toBe(false);
		const evidenceUrl = captured["evidence"];
		expect(typeof evidenceUrl).toBe("string");
		resetOutput();

		expect(
			await ulwLoopCommand([
				"record-evidence",
				"--goal-id",
				"G001-goal-a",
				"--criterion-id",
				"C001",
				"--status",
				"pass",
				"--evidence",
				String(evidenceUrl),
				"--json",
			]),
		).toBe(0);
		expect(stdoutJson()).toMatchObject({ ok: true, criterion: { id: "C001", status: "pass" } });
	});

	it("returns the command exit code while still writing failure evidence", async () => {
		const scriptPath = join(testDir, "fail-proof.mjs");
		const outputPath = join(testDir, ".omo/ulw-loop/evidence/fail-proof.log");
		await writeFile(scriptPath, "console.log('will fail'); process.exit(7)\n", "utf8");

		expect(
			await ulwLoopCommand([
				"capture-evidence",
				"--output",
				outputPath,
				"--json",
				"--",
				process.execPath,
				scriptPath,
			]),
		).toBe(7);
		expect(stdoutJson()).toMatchObject({ ok: false, exitCode: 7, artifactPath: await realpath(outputPath) });
	});

	it("rejects existing capture outputs instead of overwriting evidence", async () => {
		const scriptPath = join(testDir, "existing-proof.mjs");
		const outputPath = join(testDir, ".omo/ulw-loop/evidence/existing-proof.log");
		await mkdir(join(testDir, ".omo/ulw-loop/evidence"), { recursive: true });
		await writeFile(scriptPath, "console.log('new proof')\n", "utf8");
		await writeFile(outputPath, "old proof\n", "utf8");

		expect(
			await ulwLoopCommand([
				"capture-evidence",
				"--output",
				outputPath,
				"--json",
				"--",
				process.execPath,
				scriptPath,
			]),
		).toBe(1);
		expect(stdoutJson()).toMatchObject({ ok: false, error: { code: "ULW_LOOP_CAPTURE_OUTPUT_EXISTS" } });
	});

	it("rejects output outside the evidence directory without creating parent directories", async () => {
		const scriptPath = join(testDir, "outside-proof.mjs");
		const outsideParent = join(testDir, "outside", "nested");
		await writeFile(scriptPath, "console.log('outside proof')\n", "utf8");

		expect(
			await ulwLoopCommand([
				"capture-evidence",
				"--output",
				join(outsideParent, "proof.log"),
				"--json",
				"--",
				process.execPath,
				scriptPath,
			]),
		).toBe(1);
		expect(stdoutJson()).toMatchObject({ ok: false, error: { code: "ULW_LOOP_CAPTURE_OUTPUT_OUTSIDE_ROOT" } });
		await expect(access(outsideParent)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("rejects output through an evidence-directory symlink escape without creating nested directories", async () => {
		const scriptPath = join(testDir, "symlink-proof.mjs");
		const outsideDir = join(testDir, "outside-target");
		const evidenceDir = join(testDir, ".omo/ulw-loop/evidence");
		const linkPath = join(evidenceDir, "link-out");
		await mkdir(outsideDir, { recursive: true });
		await mkdir(evidenceDir, { recursive: true });
		await symlink(outsideDir, linkPath, "dir");
		await writeFile(scriptPath, "console.log('symlink proof')\n", "utf8");

		expect(
			await ulwLoopCommand([
				"capture-evidence",
				"--output",
				join(linkPath, "nested", "proof.log"),
				"--json",
				"--",
				process.execPath,
				scriptPath,
			]),
		).toBe(1);
		expect(stdoutJson()).toMatchObject({ ok: false, error: { code: "ULW_LOOP_CAPTURE_OUTPUT_OUTSIDE_ROOT" } });
		await expect(access(join(outsideDir, "nested"))).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("rejects capture when the .omo directory is a symlink escape without creating evidence roots", async () => {
		const scriptPath = join(testDir, "omo-symlink-proof.mjs");
		const outsideDir = join(testDir, "outside-omo");
		await mkdir(outsideDir, { recursive: true });
		await symlink(outsideDir, join(testDir, ".omo"), "dir");
		await writeFile(scriptPath, "console.log('omo symlink proof')\n", "utf8");

		expect(
			await ulwLoopCommand([
				"capture-evidence",
				"--output",
				join(testDir, ".omo/ulw-loop/evidence/proof.log"),
				"--json",
				"--",
				process.execPath,
				scriptPath,
			]),
		).toBe(1);
		expect(stdoutJson()).toMatchObject({ ok: false, error: { code: "ULW_LOOP_CAPTURE_OUTPUT_OUTSIDE_ROOT" } });
		await expect(access(join(outsideDir, "ulw-loop"))).rejects.toMatchObject({ code: "ENOENT" });
	});
});

describe("ulwLoopCommand criteria", () => {
	it("lists criteria for a goal", async () => {
		await createPlan();

		expect(await ulwLoopCommand(["criteria", "--goal-id", "G001-goal-a"])).toBe(0);
		expect(out.join("")).toContain("C001");
		expect(out.join("")).toContain("happy");
	});

	it("supports --json output", async () => {
		await createPlan();

		expect(await ulwLoopCommand(["criteria", "--goal-id", "G001-goal-a", "--json"])).toBe(0);
		expect(stdoutJson()).toMatchObject({ ok: true, goalId: "G001-goal-a" });
		expect(stdoutJson()).toHaveProperty("criteria.0.id", "C001");
	});
});

describe("ulwLoopCommand steer", () => {
	it("dispatches to the steering engine", async () => {
		await createPlan();

		expect(
			await ulwLoopCommand([
				"steer",
				"--kind",
				"add_subgoal",
				"--title",
				"Extra",
				"--objective",
				"Do extra",
				"--evidence",
				"user requested it",
				"--rationale",
				"keeps plan accurate",
				"--json",
			]),
		).toBe(0);
		expect(stdoutJson()).toMatchObject({
			ok: true,
			accepted: true,
			plan: {
				goals: [
					{ id: "G001-goal-a" },
					{ id: "G002-goal-b" },
					{ id: "G003", title: "Extra", successCriteria: [{ id: "C001" }, { id: "C002" }, { id: "C003" }] },
				],
			},
		});
	});
});

describe("ulwLoopCommand add-goal", () => {
	it("appends a pending goal", async () => {
		await createPlan();

		expect(await ulwLoopCommand(["add-goal", "--title", "Later", "--objective", "Do later", "--json"])).toBe(0);
		expect(stdoutJson()).toMatchObject({ ok: true, goal: { title: "Later", status: "pending" } });
	});
});

describe("ulwLoopCommand unknown", () => {
	it("returns 1 + prints help on unknown subcommand", async () => {
		expect(await ulwLoopCommand(["wat"])).toBe(1);
		expect(out.join("")).toContain("omo ulw-loop");
	});
});

describe("ulwLoopCommand error handling", () => {
	it("returns 1 + prints [ulw-loop] prefix on UlwLoopError", async () => {
		expect(await ulwLoopCommand(["status"])).toBe(1);
		expect(err.join("")).toContain("[ulw-loop]");
	});

	it("#given no --json #when an error occurs #then writes only to stderr and leaves stdout empty", async () => {
		expect(await ulwLoopCommand(["status"])).toBe(1);
		expect(out.join("")).toBe("");
		expect(err.join("")).toContain("[ulw-loop]");
	});
});
