import { createHash } from "node:crypto";
import type { ConsensusResultEnvelope } from "./verification-pipeline-types.js";

const REQUIRED_FIELDS = ["runId", "consensusId", "agentId", "persona", "verdict", "reason", "requiresParentAck"];
const VALID_PERSONAS = ["advocate", "devils_advocate", "regression_reviewer", "security_state_reviewer"];
const VALID_VERDICTS = ["approve", "reject", "needs_rework", "inconclusive"];
const FORBIDDEN_KEYS = ["mayFinalizeRun", "mayChangeModel", "wouldSwitchModel"];

export function validateConsensusSchema(envelope: Record<string, unknown>): void {
	if (!envelope || typeof envelope !== "object") throw new Error("Envelope must be an object");
	for (const key of REQUIRED_FIELDS) {
		if (!(key in envelope)) {
			throw new Error(`Missing required field: ${key}`);
		}
	}
	if (typeof envelope["runId"] !== "string") throw new Error("runId must be a string");
	if (typeof envelope["consensusId"] !== "string") throw new Error("consensusId must be a string");
	if (typeof envelope["agentId"] !== "string") throw new Error("agentId must be a string");
	if (!VALID_PERSONAS.includes(envelope["persona"] as string)) {
		throw new Error(`Invalid persona: ${String(envelope["persona"])}`);
	}
	if (!VALID_VERDICTS.includes(envelope["verdict"] as string)) {
		throw new Error(`Invalid verdict: ${String(envelope["verdict"])}`);
	}
	if (typeof envelope["reason"] !== "string") throw new Error("reason must be a string");
	if (envelope["requiresParentAck"] !== true) throw new Error("requiresParentAck must be true");

	for (const key of FORBIDDEN_KEYS) {
		if (key in envelope) {
			throw new Error(`Forbidden property in envelope: ${key}`);
		}
	}
}

export function getEnvelopeHash(envelope: ConsensusResultEnvelope): string {
	const normalized = {
		runId: envelope["runId"],
		consensusId: envelope["consensusId"],
		agentId: envelope["agentId"],
		persona: envelope["persona"],
		verdict: envelope["verdict"],
		reason: envelope["reason"],
		requiresParentAck: envelope["requiresParentAck"],
	};
	return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
