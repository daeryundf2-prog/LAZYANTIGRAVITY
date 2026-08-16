import type { LiveConsensusClient } from "./consensus-types.js";
export interface OpencodeSdkClient {
    session: {
        create(opts: {
            body: {
                parentID: string;
                title: string;
            };
        }): Promise<{
            data?: {
                id?: string;
            };
            id?: string;
        }>;
        prompt(opts: {
            path: {
                id: string;
            };
            body: {
                parts: Array<{
                    type: string;
                    text: string;
                }>;
                json_schema: Record<string, unknown>;
            };
        }): Promise<void>;
        message(opts: {
            path: {
                id: string;
            };
            body: {
                parts: Array<{
                    type: string;
                    text: string;
                }>;
            };
        }): Promise<void>;
        messages(opts: {
            path: {
                id: string;
            };
        }): Promise<Record<string, unknown>>;
        status(): Promise<Record<string, unknown>>;
    };
}
export declare class OpenCodeLiveConsensusClient implements LiveConsensusClient {
    private baseUrl;
    private client;
    constructor(baseUrl: string);
    init(): Promise<void>;
    createSession(runId: string, title: string): Promise<string>;
    sendMessage(sessionId: string, text: string, schema?: Record<string, unknown>): Promise<void>;
    pollMessages(sessionId: string, timeoutMs: number): Promise<{
        text: string;
        structuredOutput?: Record<string, unknown>;
    }>;
}
