import type { DryRunContext, DryRunState } from "./dry-run-types.js";
export declare function out(json: boolean, msg: string): void;
export declare function saveDryRunCheckpoint(ctx: DryRunContext, state: DryRunState, taskId: string): Promise<void>;
export declare function cleanupRunDir(writeCheckpoint: boolean, writeLedger: boolean, runDir: string): void;
export declare function printFinalOutput(state: DryRunState, ctx: DryRunContext, scenario: string): boolean;
