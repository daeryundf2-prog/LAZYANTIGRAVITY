import { type UlwLoopScope } from "./paths.js";
import type { UlwLoopLedgerEntry, UlwLoopPlan } from "./types.js";
/**
 * Cross-process file lock for a ulw-loop run ledger. Uses an atomic `open(path, "wx")`
 * lock file so concurrent processes (hook + CLI + heartbeat) cannot read-modify-write
 * the same hash chain with a shared prevHash. Releases the lock on completion or error.
 */
export declare function withLedgerWriteLock<T>(repoRoot: string, runId: string, fn: () => Promise<T>): Promise<T>;
export declare function withUlwLoopMutationLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T>;
export declare function withUlwLoopMutationLock<T>(repoRoot: string, scope: UlwLoopScope | undefined, fn: () => Promise<T>): Promise<T>;
export declare function readUlwLoopPlan(repoRoot: string, scope?: UlwLoopScope): Promise<UlwLoopPlan>;
export declare function writePlan(repoRoot: string, plan: UlwLoopPlan, scope?: UlwLoopScope): Promise<void>;
export declare function appendLedger(repoRoot: string, entry: UlwLoopLedgerEntry, scope?: UlwLoopScope): Promise<void>;
export declare function readSteeringLedgerEntries(repoRoot: string, scope?: UlwLoopScope): Promise<UlwLoopLedgerEntry[]>;
