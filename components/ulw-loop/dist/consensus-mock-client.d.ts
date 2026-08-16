import type { LiveConsensusClient } from "./consensus-types.js";
import type { ConsensusPersona } from "./verification-pipeline-types.js";
export declare const mockSessionToPersona: Record<string, string>;
export declare const mockPersonaVerdict: Record<string, string>;
export declare function setMockPersonaVerdict(persona: ConsensusPersona, verdict: string): void;
export declare class MockLiveConsensusClient implements LiveConsensusClient {
    private runId;
    private consensusId;
    constructor(runId: string, consensusId: string);
    createSession(_runId: string, _title: string): Promise<string>;
    sendMessage(_sessionId: string, _text: string, _schema?: Record<string, unknown>): Promise<void>;
    pollMessages(sessionId: string, _timeoutMs: number): Promise<{
        text: string;
        structuredOutput?: Record<string, unknown>;
    }>;
}
