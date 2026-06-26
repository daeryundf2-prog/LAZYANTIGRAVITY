import { type LockHandle } from "./lock.js";
import type { DaemonPaths } from "./paths.js";
export declare class DaemonUnreachableError extends Error {
    constructor(socketPath: string);
}
export interface EnsureDaemonDeps {
    probe(socketPath: string): Promise<boolean>;
    acquireLock(lockPath: string): LockHandle | null;
    cleanupStaleSocket(socketPath: string): void;
    spawnDaemon(paths: DaemonPaths): void;
    sleep(ms: number): Promise<void>;
    now(): number;
}
export interface EnsureDaemonOptions {
    readyTimeoutMs?: number;
    pollIntervalMs?: number;
}
export declare function ensureDaemonRunning(paths: DaemonPaths, deps?: EnsureDaemonDeps, options?: EnsureDaemonOptions): Promise<void>;
export declare function probeSocket(socketPath: string, timeoutMs?: number): Promise<boolean>;
export declare function spawnDaemonProcess(paths: DaemonPaths): void;
export declare function defaultEnsureDaemonDeps(): EnsureDaemonDeps;
