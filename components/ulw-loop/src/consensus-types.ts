import type { ConsensusPersona } from "./verification-pipeline-types.js";

export const ALL_PERSONAS: ConsensusPersona[] = [
	"advocate",
	"devils_advocate",
	"regression_reviewer",
	"security_state_reviewer",
];

export interface DispatchConsensusOptions {
	live?: boolean;
	mockLive?: boolean;
	prompt?: string | undefined;
	voterTimeoutMs?: number | undefined;
	consensusTimeoutMs?: number | undefined;
	opencodeBaseUrl?: string | undefined;
}

export interface LiveConsensusClient {
	createSession(runId: string, title: string): Promise<string>;
	sendMessage(sessionId: string, text: string, schema?: Record<string, unknown>): Promise<void>;
	pollMessages(
		sessionId: string,
		timeoutMs: number,
	): Promise<{ text: string; structuredOutput?: Record<string, unknown> }>;
}

export const CONSENSUS_RESULT_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		runId: { type: "string" },
		consensusId: { type: "string" },
		agentId: { type: "string" },
		persona: {
			type: "string",
			enum: ["advocate", "devils_advocate", "regression_reviewer", "security_state_reviewer"],
		},
		verdict: { type: "string", enum: ["approve", "reject", "needs_rework", "inconclusive"] },
		reason: { type: "string" },
		requiresParentAck: { type: "boolean", const: true },
	},
	required: ["runId", "consensusId", "agentId", "persona", "verdict", "reason", "requiresParentAck"],
	additionalProperties: false,
};
