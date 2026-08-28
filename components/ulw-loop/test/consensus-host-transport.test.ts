import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runCheckpointConsensusStep } from "../src/checkpoint-consensus-step.js";
import { dispatchConsensus } from "../src/consensus-dispatch.js";
import { aggregateConsensus, reportConsensusResult } from "../src/consensus-dispatcher.js";
import { getConsensusPending } from "../src/consensus-pending.js";
import type { UlwLoopItem } from "../src/types.js";

let testDir: string;

afterEach(async () => {
	if (testDir) await rm(testDir, { recursive: true, force: true });
});

function goal(objective: string): UlwLoopItem {
	return { id: "G1", objective } as unknown as UlwLoopItem;
}

function envelope(
	runId: string,
	consensusId: string,
	agentId: string,
	persona: string,
	verdict: "approve" | "reject" | "needs_rework" | "inconclusive",
) {
	return {
		runId,
		consensusId,
		agentId,
		persona,
		verdict,
		reason: `${persona} analysis`,
		requiresParentAck: true,
	};
}

describe("host-subagent consensus transport", () => {
	it("drains pending personas and aggregates mixed verdicts into a terminal event", async () => {
		testDir = await mkdtemp(join(tmpdir(), "consensus-host-mixed-"));
		const runId = "run-host-mixed";
		const { consensusId } = await dispatchConsensus(testDir, runId, "fp-mixed", {
			prompt: "Verify the auth changes.",
		});

		let pending = await getConsensusPending(testDir, runId, consensusId);
		expect(pending.prompt).toBe("Verify the auth changes.");
		expect(pending.pending).toHaveLength(4);
		expect(pending.pending.map((p) => p.persona).sort()).toEqual([
			"advocate",
			"devils_advocate",
			"regression_reviewer",
			"security_state_reviewer",
		]);
		for (const item of pending.pending) {
			expect(item.agentId).toBe(`${item.persona}-${consensusId.slice(0, 8)}`);
			expect(item.fullPrompt).toContain("합의 대상 프롬프트");
		}

		for (const item of pending.pending) {
			await reportConsensusResult(
				testDir,
				runId,
				consensusId,
				item.agentId,
				envelope(runId, consensusId, item.agentId, item.persona, item.persona === "devils_advocate" ? "needs_rework" : "approve"),
			);
		}

		pending = await getConsensusPending(testDir, runId, consensusId);
		expect(pending.pending).toHaveLength(0);

		const verdict = await aggregateConsensus(testDir, runId, consensusId);
		expect(verdict).toBe("consensus_rework_required");
	});

	it("lets a checkpoint finalize when all personas approve through the host transport", async () => {
		testDir = await mkdtemp(join(tmpdir(), "consensus-host-pass-"));
		const runId = "run-host-pass";
		const fingerprint = "fp-host-pass-1";
		await dispatchConsensus(testDir, runId, fingerprint, { prompt: "Verify the refactor." });

		const pending = await getConsensusPending(testDir, runId);
		for (const item of pending.pending) {
			await reportConsensusResult(
				testDir,
				runId,
				pending.consensusId,
				item.agentId,
				envelope(runId, pending.consensusId, item.agentId, item.persona, "approve"),
			);
		}
		await aggregateConsensus(testDir, runId, pending.consensusId);

		const step = await runCheckpointConsensusStep(testDir, runId, fingerprint, goal("Host transport"), [], []);
		expect(step.finalizerAllowed).toBe(true);
		expect(step.goalStatusOverride).toBeUndefined();
	});
});
