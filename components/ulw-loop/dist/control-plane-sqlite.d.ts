import type { EventType, LedgerEvent } from "./control-plane-types.js";
/**
 * Enterprise Transactional Ledger Store (SQLite / WAL Synchronizer)
 * Ensures zero-data-loss atomic state transitions with sub-millisecond checkpointing.
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
