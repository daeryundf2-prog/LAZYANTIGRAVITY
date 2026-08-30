import type { LedgerEvent, RunStateSchema } from "./control-plane-types.js";
export declare function mutateStateWithEvent(runState: RunStateSchema, event: LedgerEvent, subConfig: {
    defaultLeaseMs: number;
    maxLeaseMs: number;
    staleGraceMs: number;
}): void;
