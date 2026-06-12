import { existsSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	aggregateConsensus,
	dispatchConsensus,
	reportConsensusResult,
	setMockPersonaVerdict,
	validateConsensusSchema,
} from "../src/consensus-dispatcher.js";
import { appendRunEvent, getRunDir, readRunEvents } from "../src/control-plane.js";
import { validateConsensusResultEnvelope } from "../src/verification-pipeline.js";

const repoRoot = process.cwd();
const runId = "test-live-run-id";
const runDir = getRunDir(repoRoot, runId);

describe("Consensus Live Invocation Tests", () => {
	beforeEach(async () => {
		if (existsSync(runDir)) {
			rmSync(runDir, { recursive: true, force: true });
		}
		// Always initialize the run directory and events
		await appendRunEvent(repoRoot, runId, "run.created", {});
	});

	afterEach(() => {
		if (existsSync(runDir)) {
			rmSync(runDir, { recursive: true, force: true });
		}
	});

	it("should execute happy path with all approve verdicts", async () => {
		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		await dispatchConsensus(repoRoot, runId, "fp-test", {
			mockLive: true,
			prompt: "Check this design",
			voterTimeoutMs: 5000,
		});

		const events = await readRunEvents(repoRoot, runId);

		const started = events.find((e) => e.type === "quality_gate.consensus_started");
		expect(started).toBeDefined();
		expect(started?.isMockLive).toBe(true);

		const reported = events.filter((e) => e.type === "quality_gate.consensus_persona_reported");
		expect(reported.length).toBe(4);
		for (const r of reported) {
			expect(r.isMockLive).toBe(true);
		}

		const passedEvent = events.find((e) => e.type === "quality_gate.consensus_passed");
		expect(passedEvent).toBeDefined();
		expect(passedEvent?.finalizerAllowed).toBe(true);
		expect(passedEvent?.isMockLive).toBe(true);
	});

	it("should fail consensus if devils advocate rejects", async () => {
		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "reject");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		await dispatchConsensus(repoRoot, runId, "fp-test-fail", {
			mockLive: true,
			prompt: "Check devil case",
			voterTimeoutMs: 5000,
		});

		const events = await readRunEvents(repoRoot, runId);
		const failedEvent = events.find((e) => e.type === "quality_gate.consensus_failed");
		expect(failedEvent).toBeDefined();
		expect(failedEvent?.finalizerAllowed).toBe(false);
	});

	it("should return rework required if regression reviewer flags needs_rework", async () => {
		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "needs_rework");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		await dispatchConsensus(repoRoot, runId, "fp-test-rework", {
			mockLive: true,
			prompt: "Check regression",
			voterTimeoutMs: 5000,
		});

		const events = await readRunEvents(repoRoot, runId);
		const reworkEvent = events.find((e) => e.type === "quality_gate.consensus_rework_required");
		expect(reworkEvent).toBeDefined();
		expect(reworkEvent?.finalizerAllowed).toBe(false);
	});

	it("should return inconclusive if one of the personas returns inconclusive", async () => {
		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "inconclusive");

		await dispatchConsensus(repoRoot, runId, "fp-test-inc", {
			mockLive: true,
			prompt: "Check inc case",
			voterTimeoutMs: 5000,
		});

		const events = await readRunEvents(repoRoot, runId);
		const incEvent = events.find((e) => e.type === "quality_gate.consensus_inconclusive");
		expect(incEvent).toBeDefined();
		expect(incEvent?.finalizerAllowed).toBe(false);
		expect(incEvent?.parentActionRequired).toBe(true);
	});

	it("should reject envelope with mayFinalizeRun=true", () => {
		const badEnvelope = {
			runId,
			consensusId: "c-id",
			agentId: "a-id",
			persona: "advocate",
			verdict: "approve",
			reason: "looks complete",
			requiresParentAck: true,
			mayFinalizeRun: true,
		};

		expect(() => validateConsensusResultEnvelope(badEnvelope, runId, "c-id")).toThrow();
	});

	it("should reject envelope with mayChangeModel=true", () => {
		const badEnvelope = {
			runId,
			consensusId: "c-id",
			agentId: "a-id",
			persona: "advocate",
			verdict: "approve",
			reason: "looks complete",
			requiresParentAck: true,
			mayChangeModel: true,
		};

		expect(() => validateConsensusResultEnvelope(badEnvelope, runId, "c-id")).toThrow();
	});

	it("should reject envelope with wouldSwitchModel=true", () => {
		const badEnvelope = {
			runId,
			consensusId: "c-id",
			agentId: "a-id",
			persona: "advocate",
			verdict: "approve",
			reason: "looks complete",
			requiresParentAck: true,
			wouldSwitchModel: true,
		};

		expect(() => validateConsensusResultEnvelope(badEnvelope, runId, "c-id")).toThrow();
	});

	it("should reject envelope containing completion phrases in reason", () => {
		const badEnvelope = {
			runId,
			consensusId: "c-id",
			agentId: "a-id",
			persona: "advocate",
			verdict: "approve",
			reason: "I have finished the entire /ulw task",
			requiresParentAck: true,
		};

		expect(() => validateConsensusResultEnvelope(badEnvelope, runId, "c-id")).toThrow();
	});

	it("should handle duplicate same payload as idempotent success", async () => {
		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		const result = await dispatchConsensus(repoRoot, runId, "fp-test-dup", {
			mockLive: true,
			prompt: "Check duplicate",
			voterTimeoutMs: 5000,
		});

		const events = await readRunEvents(repoRoot, runId);
		const reportedAdvocate = events.find(
			(e) =>
				e.type === "quality_gate.consensus_persona_reported" &&
				e.consensusId === result.consensusId &&
				e.persona === "advocate",
		);
		expect(reportedAdvocate).toBeDefined();

		const envelope = reportedAdvocate?.result;
		const originalEventCount = events.length;

		// Re-reporting identical payload
		await reportConsensusResult(
			repoRoot,
			runId,
			result.consensusId,
			reportedAdvocate?.agentId as string,
			envelope,
			true,
		);

		const eventsAfter = await readRunEvents(repoRoot, runId);
		// Event count should be identical (no new event appended)
		expect(eventsAfter.length).toBe(originalEventCount);
	});

	it("should handle duplicate conflicting payload as conflict error", async () => {
		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		setMockPersonaVerdict("security_state_reviewer", "approve");

		const result = await dispatchConsensus(repoRoot, runId, "fp-test-conflict", {
			mockLive: false,
		});

		const cId = result.consensusId;
		const aId = (p: string) => `${p}-${cId.substring(0, 8)}`;
		const mockEnvelope = (p: string) => ({
			runId,
			consensusId: cId,
			agentId: aId(p),
			persona: p as any,
			verdict: "approve" as const,
			reason: "mock approve",
			requiresParentAck: true as const,
		});

		await reportConsensusResult(repoRoot, runId, cId, aId("advocate"), mockEnvelope("advocate"), true);
		await reportConsensusResult(repoRoot, runId, cId, aId("devils_advocate"), mockEnvelope("devils_advocate"), true);
		await reportConsensusResult(
			repoRoot,
			runId,
			cId,
			aId("regression_reviewer"),
			mockEnvelope("regression_reviewer"),
			true,
		);
		await reportConsensusResult(
			repoRoot,
			runId,
			cId,
			aId("security_state_reviewer"),
			mockEnvelope("security_state_reviewer"),
			true,
		);

		const conflictingEnvelope = {
			...mockEnvelope("advocate"),
			verdict: "reject" as const,
		};

		await expect(
			reportConsensusResult(repoRoot, runId, cId, aId("advocate"), conflictingEnvelope, true),
		).rejects.toThrow(/Conflict/);

		const eventsAfter = await readRunEvents(repoRoot, runId);
		const conflictEvent = eventsAfter.find((e) => e.type === "quality_gate.consensus_persona_conflict");
		expect(conflictEvent).toBeDefined();

		await aggregateConsensus(repoRoot, runId, cId);
		const eventsFinal = await readRunEvents(repoRoot, runId);
		const failedEvent = eventsFinal.find((e) => e.type === "quality_gate.consensus_failed" && e.consensusId === cId);
		expect(failedEvent).toBeDefined();
		expect(failedEvent?.finalizerAllowed).toBe(false);
	});

	it("should throw error if SDK is missing when live: true", async () => {
		await expect(
			dispatchConsensus(repoRoot, runId, "fp-sdk-missing", {
				live: true,
				prompt: "Verify workspace changes",
			}),
		).rejects.toThrow();
	});

	it("should handle individual voter timeout", async () => {
		setMockPersonaVerdict("advocate", "approve");
		setMockPersonaVerdict("devils_advocate", "approve");
		setMockPersonaVerdict("regression_reviewer", "approve");
		// Mock inconclusive/timeout
		setMockPersonaVerdict("security_state_reviewer", "inconclusive");

		await dispatchConsensus(repoRoot, runId, "fp-voter-timeout", {
			mockLive: true,
			prompt: "Verify voter timeout",
			voterTimeoutMs: 1000,
		});

		const events = await readRunEvents(repoRoot, runId);
		const reported = events.filter((e) => e.type === "quality_gate.consensus_persona_reported");
		expect(reported.length).toBe(4);

		const timedOutReporter = reported.find((r) => r.persona === "security_state_reviewer");
		expect((timedOutReporter?.result as any)?.verdict).toBe("inconclusive");
	});

	it("should handle entire consensus timeout (missing response)", async () => {
		// Mock advocate to delays response (MockClient pollMessages is synchronous, but we can test aggregate missing response logic directly)
		const resTimeout = await dispatchConsensus(repoRoot, runId, "fp-consensus-timeout", {
			mockLive: false, // Don't trigger auto triggerLiveConsensus
		});

		// Report only 3 personas, leaving regression_reviewer missing
		const cId = resTimeout.consensusId;
		const aId = (p: string) => `${p}-${cId.substring(0, 8)}`;
		const mockEnvelope = (p: string) => ({
			runId,
			consensusId: cId,
			agentId: aId(p),
			persona: p as any,
			verdict: "approve" as const,
			reason: "mock approve",
			requiresParentAck: true as const,
		});

		await reportConsensusResult(repoRoot, runId, cId, aId("advocate"), mockEnvelope("advocate"), true);
		await reportConsensusResult(repoRoot, runId, cId, aId("devils_advocate"), mockEnvelope("devils_advocate"), true);
		await reportConsensusResult(
			repoRoot,
			runId,
			cId,
			aId("security_state_reviewer"),
			mockEnvelope("security_state_reviewer"),
			true,
		);

		// Aggregate missing response
		const verdict = await aggregateConsensus(repoRoot, runId, cId);
		expect(verdict).toBe("consensus_inconclusive");

		const events = await readRunEvents(repoRoot, runId);
		const incEvent = events.find((e) => e.type === "quality_gate.consensus_inconclusive" && e.consensusId === cId);
		expect(incEvent).toBeDefined();
		expect(incEvent?.finalizerAllowed).toBe(false);
		expect(incEvent?.parentActionRequired).toBe(true);
		expect(incEvent?.missingPersonas).toEqual(["regression_reviewer"]);
	});

	it("should execute mock dry-run successfully", async () => {
		const { dryRunCmd } = await import("../src/dry-run.js");
		const exitCode = await dryRunCmd(repoRoot, ["--scenario", "consensus-live-invocation", "--json"], true);
		expect(exitCode).toBe(0);
	});

	it("should validate schema correctly", () => {
		const goodEnvelope = {
			runId,
			consensusId: "c-id",
			agentId: "a-id",
			persona: "advocate",
			verdict: "approve",
			reason: "looks complete",
			requiresParentAck: true,
		};
		expect(() => validateConsensusSchema(goodEnvelope)).not.toThrow();

		const missingField = {
			runId,
			consensusId: "c-id",
			agentId: "a-id",
			persona: "advocate",
			verdict: "approve",
		};
		expect(() => validateConsensusSchema(missingField)).toThrow();

		const badVerdict = {
			...goodEnvelope,
			verdict: "bad-verdict",
		};
		expect(() => validateConsensusSchema(badVerdict)).toThrow();

		const withForbiddenProp = {
			...goodEnvelope,
			wouldSwitchModel: true,
		};
		expect(() => validateConsensusSchema(withForbiddenProp)).toThrow();
	});
});
