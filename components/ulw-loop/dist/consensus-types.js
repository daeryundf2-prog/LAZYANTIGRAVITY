export const ALL_PERSONAS = [
    "advocate",
    "devils_advocate",
    "regression_reviewer",
    "security_state_reviewer",
];
export const CONSENSUS_RESULT_SCHEMA = {
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
