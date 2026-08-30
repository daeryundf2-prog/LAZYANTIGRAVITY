import type { EventType, LedgerEvent } from "./control-plane-types.js";
export declare function appendRunEvent(repoRoot: string, runId: string, type: EventType, data: Omit<LedgerEvent, "timestamp" | "type" | "runId">): Promise<LedgerEvent>;
