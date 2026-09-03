import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SESSION_STATE_LOCK_CONTENDED = Symbol("session-state-lock-contended");

export type SessionStateLockResult<T> = T | typeof SESSION_STATE_LOCK_CONTENDED;

const LOCK_RETRY_COUNT = 20;
const LOCK_RETRY_DELAY_MS = 5;
const STALE_LOCK_THRESHOLD_MS = 30_000;
const LOCK_SLEEP_VIEW = new Int32Array(new SharedArrayBuffer(4));

export function withSessionStateLock<T>(cachePath: string, callback: () => T): SessionStateLockResult<T> {
	const lockPath = `${cachePath}.lock`;
	const pidPath = join(lockPath, "owner.pid");
	mkdirSync(dirname(cachePath), { recursive: true });

	for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
		try {
			mkdirSync(lockPath);
			try {
				writeFileSync(pidPath, `${process.pid}:${Date.now()}`);
			} catch {
				// Ignore metadata write error
			}
			try {
				return callback();
			} finally {
				try {
					rmSync(lockPath, { recursive: true, force: true });
				} catch {
					// Ignore transient release collision on Windows
				}
			}
		} catch (error) {
			const code = errorCode(error);
			if (code === "EEXIST" || (process.platform === "win32" && (code === "EPERM" || code === "EACCES"))) {
				// Check for stale lock
				try {
					const stat = statSync(lockPath);
					const age = Date.now() - stat.mtimeMs;
					if (age > STALE_LOCK_THRESHOLD_MS) {
						try {
							rmSync(lockPath, { recursive: true, force: true });
						} catch {
							// Stale cleanup failed
						}
						continue;
					}
				} catch {
					// Stat failed or already released, retry
				}
				sleepSync(LOCK_RETRY_DELAY_MS);
				continue;
			}
			throw error;
		}
	}
	return SESSION_STATE_LOCK_CONTENDED;
}

function errorCode(error: unknown): unknown {
	if (!isRecord(error)) {
		return undefined;
	}
	return Reflect.get(error, "code");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleepSync(milliseconds: number): void {
	Atomics.wait(LOCK_SLEEP_VIEW, 0, 0, milliseconds);
}
