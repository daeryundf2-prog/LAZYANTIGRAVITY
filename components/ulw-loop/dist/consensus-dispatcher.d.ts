import type { ConsensusPersona, ConsensusResultEnvelope } from "./verification-pipeline-types.js";
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
    sendMessage(sessionId: string, text: string, schema?: any): Promise<void>;
    pollMessages(sessionId: string, timeoutMs: number): Promise<{
        text: string;
        structuredOutput?: any;
    }>;
}
export declare const CONSENSUS_RESULT_SCHEMA: {
    type: string;
    properties: {
        runId: {
            type: string;
        };
        consensusId: {
            type: string;
        };
        agentId: {
            type: string;
        };
        persona: {
            type: string;
            enum: string[];
        };
        verdict: {
            type: string;
            enum: string[];
        };
        reason: {
            type: string;
        };
        requiresParentAck: {
            type: string;
            const: boolean;
        };
    };
    required: string[];
    additionalProperties: boolean;
};
export declare function validateConsensusSchema(envelope: any): void;
export declare function getEnvelopeHash(envelope: ConsensusResultEnvelope): string;
export declare class OpenCodeLiveConsensusClient implements LiveConsensusClient {
    private baseUrl;
    private client;
    constructor(baseUrl: string);
    init(): Promise<void>;
    createSession(runId: string, title: string): Promise<string>;
    sendMessage(sessionId: string, text: string, schema?: any): Promise<void>;
    pollMessages(sessionId: string, timeoutMs: number): Promise<{
        text: string;
        structuredOutput?: any;
    }>;
}
export declare class MockLiveConsensusClient implements LiveConsensusClient {
    private runId;
    private consensusId;
    constructor(runId: string, consensusId: string);
    createSession(_runId: string, _title: string): Promise<string>;
    sendMessage(_sessionId: string, _text: string, _schema?: any): Promise<void>;
    pollMessages(sessionId: string, _timeoutMs: number): Promise<{
        text: string;
        structuredOutput?: any;
    }>;
}
export declare function dispatchConsensus(repoRoot: string, runId: string, qualityInputFingerprint?: string, options?: DispatchConsensusOptions): Promise<{
    consensusId: string;
}>;
export declare function reportConsensusResult(repoRoot: string, runId: string, consensusId: string, agentId: string, resultJson: unknown, isMockLive?: boolean, metrics?: {
    durationCreateSessionMs?: number;
    durationSendMessageMs?: number;
    durationPollMs?: number;
}): Promise<void>;
export declare function aggregateConsensus(repoRoot: string, runId: string, consensusId: string): Promise<string>;
export declare function setMockPersonaVerdict(persona: ConsensusPersona, verdict: string): void;
export declare function triggerLiveConsensus(repoRoot: string, runId: string, consensusId: string, prompt: string, voterTimeoutMs: number, consensusTimeoutMs: number, _qualityInputFingerprint?: string, client?: LiveConsensusClient): Promise<void>;
