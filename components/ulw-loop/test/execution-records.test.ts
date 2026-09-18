import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StrictEvidenceEnvelope } from "../src/evidence-contract.js";
import { verifyEvidenceGroundTruth } from "../src/evidence-verifier.js";
import { executionCommand } from "../src/execution-records.js";
import { executeHostCommand } from "../src/host-executor.js";

const directories: string[] = [];
function sandbox() {
	const directory = mkdtempSync(join(tmpdir(), "execution-record-"));
	directories.push(directory);
	return directory;
}
afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function evidence(cwd: string, code = 0): Promise<StrictEvidenceEnvelope> {
	const args = ["-e", `process.stdout.write('test-output');process.exit(${code})`];
	const result = await executeHostCommand({
		command: process.execPath,
		args,
		cwd,
		requestId: "request",
		runId: "run",
		sessionId: "session",
	});
	const command = executionCommand(process.execPath, args);
	return {
		status: "verified",
		summary: "Synthetic contract test with an actual local Node execution",
		commandsRun: [command],
		commandAudits: [{ command, exitCode: result.exitCode }],
		executionBinding: result.binding,
	};
}

describe("#given host execution records", () => {
	it("accepts the exact observed command and result", async () => {
		const cwd = sandbox();
		expect(verifyEvidenceGroundTruth(cwd, await evidence(cwd)).verified).toBe(true);
	});
	it("rejects agent-only ledger claims without the execution record", async () => {
		const contract = await evidence(sandbox());
		const events = [
			{
				timestamp: new Date().toISOString(),
				type: "agent.completed_reported" as const,
				runId: "run",
				result: { ...contract, verified: true },
			},
		];
		expect(verifyEvidenceGroundTruth(sandbox(), contract, events).verified).toBe(false);
	});
	it("rejects submitted success for an observed failure", async () => {
		const cwd = sandbox();
		const contract = await evidence(cwd, 7);
		expect(verifyEvidenceGroundTruth(cwd, contract).verified).toBe(false);
		expect(
			verifyEvidenceGroundTruth(cwd, {
				...contract,
				commandAudits: (contract.commandAudits ?? []).map((audit) => ({ ...audit, exitCode: 0 })),
			}).verified,
		).toBe(false);
	});
	it("rejects substituted command, session, run, tool call, timestamp, and fingerprints", async () => {
		const cwd = sandbox();
		const contract = await evidence(cwd);
		if (!contract.executionBinding) throw new Error("Missing binding");
		for (const key of [
			"sessionId",
			"runId",
			"toolCallId",
			"startedAt",
			"stdoutFingerprint",
			"stderrFingerprint",
		] as const) {
			expect(
				verifyEvidenceGroundTruth(cwd, {
					...contract,
					executionBinding: { ...contract.executionBinding, [key]: "forged" },
				}).verified,
			).toBe(false);
		}
		expect(
			verifyEvidenceGroundTruth(cwd, {
				...contract,
				commandsRun: ["npm test"],
				commandAudits: [{ command: "npm test", exitCode: 0 }],
			}).verified,
		).toBe(false);
	});
	it("rejects unaudited commands and unchecked evidence", async () => {
		const cwd = sandbox();
		const contract = await evidence(cwd);
		expect(
			verifyEvidenceGroundTruth(cwd, { ...contract, commandsRun: [...(contract.commandsRun ?? []), "npm test"] })
				.verified,
		).toBe(false);
		expect(verifyEvidenceGroundTruth(cwd, { ...contract, status: "not_checked" }).verified).toBe(false);
	});
});
