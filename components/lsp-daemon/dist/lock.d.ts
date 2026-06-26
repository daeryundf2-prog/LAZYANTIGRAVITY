export interface LockHandle {
    release(): void;
}
export declare function isProcessAlive(pid: number): boolean;
export declare function readLockPid(lockPath: string): number | null;
export declare function tryAcquireLock(lockPath: string, ownerPid?: number): LockHandle | null;
export declare function unlinkQuietly(path: string): void;
