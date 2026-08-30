import type { EventType, LedgerEvent } from "./control-plane-types.js";
/**
 * JSON-file-backed append-only ledger store.
 * Despite the historical file name this is NOT SQLite and has no WAL.
 *
 * Envelopes live in `wal-index.jsonl`, one per line, appended with a single
 * `appendFileSync` — O(1) per append. The legacy `wal-index.json` (a
 * whole-file JSON rewrite on every append, O(n^2) across a run) is migrated
 * to the JSONL form on first access; verification still reads it so old runs
 * remain auditable.
 *
 * The envelope count is cached per run and validated against the file size —
 * appends are serialized by the ledger write lock, so a size match means the
 * cached count is current, and any foreign write invalidates it.
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
