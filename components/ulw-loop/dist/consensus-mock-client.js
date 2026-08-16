import { randomUUID } from "node:crypto";
export const mockSessionToPersona = {};
export const mockPersonaVerdict = {};
export function setMockPersonaVerdict(persona, verdict) {
    mockPersonaVerdict[persona] = verdict;
}
function safeVerdict(v) {
    if (v === "approve" || v === "reject" || v === "needs_rework" || v === "inconclusive")
        return v;
    return "approve";
}
export class MockLiveConsensusClient {
    constructor(runId, consensusId) {
        this.runId = runId;
        this.consensusId = consensusId;
    }
    async createSession(_runId, _title) {
        return `mock-session-${randomUUID().slice(0, 8)}`;
    }
    async sendMessage(_sessionId, _text, _schema) {
        // Mock save session mapping is handled externally if needed
    }
    async pollMessages(sessionId, _timeoutMs) {
        const persona = mockSessionToPersona[sessionId] || "advocate";
        const mockVerdict = mockPersonaVerdict[persona] || "approve";
        if (mockVerdict === "inconclusive") {
            throw new Error("Mock persona inconclusive error");
        }
        const envelope = {
            runId: this.runId,
            consensusId: this.consensusId,
            agentId: sessionId,
            persona: persona,
            verdict: safeVerdict(mockVerdict),
            reason: `Mock consensus response for ${persona} with verdict ${mockVerdict}`,
            requiresParentAck: true,
        };
        if (mockVerdict === "invalid_envelope") {
            const badEnvelope = { ...envelope, verdict: "bad-verdict" };
            return {
                text: JSON.stringify(badEnvelope),
                structuredOutput: badEnvelope,
            };
        }
        if (mockVerdict === "invalid_schema") {
            const badEnvelope = { runId: this.runId, consensusId: this.consensusId };
            return { text: JSON.stringify(badEnvelope), structuredOutput: badEnvelope };
        }
        if (mockVerdict === "sandbox_violation_finalize") {
            const badEnvelope = { ...envelope, mayFinalizeRun: true };
            return {
                text: JSON.stringify(badEnvelope),
                structuredOutput: badEnvelope,
            };
        }
        if (mockVerdict === "sandbox_violation_model") {
            const badEnvelope = { ...envelope, mayChangeModel: true };
            return {
                text: JSON.stringify(badEnvelope),
                structuredOutput: badEnvelope,
            };
        }
        if (mockVerdict === "sandbox_violation_switch") {
            const badEnvelope = { ...envelope, wouldSwitchModel: true };
            return {
                text: JSON.stringify(badEnvelope),
                structuredOutput: badEnvelope,
            };
        }
        if (mockVerdict === "forbidden_phrase") {
            const badEnvelope = { ...envelope, reason: "I have finished the entire /ulw task" };
            return {
                text: JSON.stringify(badEnvelope),
                structuredOutput: badEnvelope,
            };
        }
        return { text: JSON.stringify(envelope), structuredOutput: envelope };
    }
}
