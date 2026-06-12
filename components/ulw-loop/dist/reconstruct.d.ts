import type { LedgerEvent, RunStateSchema } from "./control-plane-types.js";
export declare function readRunEvents(repoRoot: string, runId: string): Promise<LedgerEvent[]>;
export declare function reconstructStateFromEvents(repoRoot: string, runId: string, nowOverride?: Date): Promise<RunStateSchema>;
export declare function reconstructAndSaveState(repoRoot: string, runId: string): Promise<RunStateSchema>;
export declare function repairLedgerFile(repoRoot: string, runId: string): Promise<{
    repairedCount: number;
    corruptedCount: number;
}>;
