import type { EventType, LedgerEvent } from "./control-plane-types.js";
/**
 * JSON-file-backed append-only ledger store.
 * Despite the historical file name this is NOT SQLite and has no WAL: every
 * append rewrites the whole JSON file synchronously. It provides durable,
 * hash-chained event persistence with envelope integrity checks; atomic
 * rename-on-write and a real SQLite backend are possible future upgrades.
 */
export interface TransactionalEventEnvelope {
    readonly eventId: string;
    readonly runId: string;
    readonly sequence: number;
    readonly eventType: EventType;
    readonly payloadHash: string;
    readonly timestamp: string;
    readonly event: LedgerEvent;
}
export declare function computePayloadChecksum(payload: unknown): string;
export declare function getLedgerWalDir(repoRoot: string, runId: string): string;
export declare function appendTransactionalEvent(repoRoot: string, runId: string, event: LedgerEvent): Promise<TransactionalEventEnvelope>;
export declare function verifyLedgerWalIntegrity(repoRoot: string, runId: string): {
    valid: boolean;
    totalEvents: number;
    corruptEventIndex?: number;
};
