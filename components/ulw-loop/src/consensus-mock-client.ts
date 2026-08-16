import { randomUUID } from "node:crypto";
import type { LiveConsensusClient } from "./consensus-types.js";
import type { ConsensusPersona, ConsensusResultEnvelope } from "./verification-pipeline-types.js";

export const mockSessionToPersona: Record<string, string> = {};
export const mockPersonaVerdict: Record<string, string> = {};

export function setMockPersonaVerdict(persona: ConsensusPersona, verdict: string): void {
	mockPersonaVerdict[persona] = verdict;
}

function safeVerdict(v: string): ConsensusResultEnvelope["verdict"] {
	if (v === "approve" || v === "reject" || v === "needs_rework" || v === "inconclusive") return v;
	return "approve";
}

export class MockLiveConsensusClient implements LiveConsensusClient {
	constructor(
		private runId: string,
		private consensusId: string,
	) {}

	async createSession(_runId: string, _title: string): Promise<string> {
		return `mock-session-${randomUUID().slice(0, 8)}`;
	}

	async sendMessage(_sessionId: string, _text: string, _schema?: Record<string, unknown>): Promise<void> {
		// Mock save session mapping is handled externally if needed
	}

	async pollMessages(
		sessionId: string,
		_timeoutMs: number,
	): Promise<{ text: string; structuredOutput?: Record<string, unknown> }> {
		const persona = mockSessionToPersona[sessionId] || "advocate";
		const mockVerdict = mockPersonaVerdict[persona] || "approve";

		if (mockVerdict === "inconclusive") {
			throw new Error("Mock persona inconclusive error");
		}

		const envelope: ConsensusResultEnvelope = {
			runId: this.runId,
			consensusId: this.consensusId,
			agentId: sessionId,
			persona: persona as ConsensusPersona,
			verdict: safeVerdict(mockVerdict),
			reason: `Mock consensus response for ${persona} with verdict ${mockVerdict}`,
			requiresParentAck: true,
		};

		if (mockVerdict === "invalid_envelope") {
			const badEnvelope = { ...envelope, verdict: "bad-verdict" as ConsensusResultEnvelope["verdict"] };
			return {
				text: JSON.stringify(badEnvelope),
				structuredOutput: badEnvelope as unknown as Record<string, unknown>,
			};
		}

		if (mockVerdict === "invalid_schema") {
			const badEnvelope = { runId: this.runId, consensusId: this.consensusId };
			return { text: JSON.stringify(badEnvelope), structuredOutput: badEnvelope as Record<string, unknown> };
		}

		if (mockVerdict === "sandbox_violation_finalize") {
			const badEnvelope = { ...envelope, mayFinalizeRun: true };
			return {
				text: JSON.stringify(badEnvelope),
				structuredOutput: badEnvelope as unknown as Record<string, unknown>,
			};
		}

		if (mockVerdict === "sandbox_violation_model") {
			const badEnvelope = { ...envelope, mayChangeModel: true };
			return {
				text: JSON.stringify(badEnvelope),
				structuredOutput: badEnvelope as unknown as Record<string, unknown>,
			};
		}

		if (mockVerdict === "sandbox_violation_switch") {
			const badEnvelope = { ...envelope, wouldSwitchModel: true };
			return {
				text: JSON.stringify(badEnvelope),
				structuredOutput: badEnvelope as unknown as Record<string, unknown>,
			};
		}

		if (mockVerdict === "forbidden_phrase") {
			const badEnvelope = { ...envelope, reason: "I have finished the entire /ulw task" };
			return {
				text: JSON.stringify(badEnvelope),
				structuredOutput: badEnvelope as unknown as Record<string, unknown>,
			};
		}

		return { text: JSON.stringify(envelope), structuredOutput: envelope as unknown as Record<string, unknown> };
	}
}
