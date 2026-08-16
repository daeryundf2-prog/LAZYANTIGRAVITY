import type { ConsensusPersona } from "./verification-pipeline-types.js";
export declare const ALL_PERSONAS: ConsensusPersona[];
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
    pollMessages(sessionId: string, timeoutMs: number): Promise<{
        text: string;
        structuredOutput?: Record<string, unknown>;
    }>;
}
export declare const CONSENSUS_RESULT_SCHEMA: Record<string, unknown>;
