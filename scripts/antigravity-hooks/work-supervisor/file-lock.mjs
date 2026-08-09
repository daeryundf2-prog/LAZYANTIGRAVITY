import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { stateDir } from "./audit-ledger.mjs";

const LOCK_DIR = "locks";
const STALE_THRESHOLD_MS = 10_000;
const RELEASE_WAIT_SECONDS = 0.5;

export function ownerLock(workspaceRoot, lockName) {
	const dir = join(stateDir(workspaceRoot), LOCK_DIR);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const guardPath = join(dir, `${lockName}.guard`);
	const ownerPath = join(dir, `${lockName}.owner`);

	try {
		const guardFd = openSync(guardPath, "wx");
		closeSync(guardFd);
	} catch (e) {
		if (e.code !== "EEXIST") throw e;
	}

	const ownerContent = `${process.pid}:${randomUUID()}`;
	try {
		const ownerFd = openSync(ownerPath, "wx");
		writeFileSync(ownerFd, ownerContent, "utf8");
		closeSync(ownerFd);
		return { acquired: true, guardPath, ownerPath, ownerContent };
	} catch (e) {
		if (e.code !== "EEXIST") throw e;
		const existing = readOwnerRecord(ownerPath);
		const stale = !existing || isStaleOwner(existing.pid, existing.ts);
		if (stale) {
			try { unlinkSync(ownerPath); } catch {}
			try {
				const ownerFd = openSync(ownerPath, "wx");
				writeFileSync(ownerFd, ownerContent, "utf8");
				closeSync(ownerFd);
				return { acquired: true, guardPath, ownerPath, ownerContent };
			} catch {
				return { acquired: false, guardPath, ownerPath };
			}
		}
		return { acquired: false, guardPath, ownerPath };
	}
}

export function releaseOwnerLock(lock) {
	if (!lock || !lock.acquired) return;
	try {
		const current = readFileSync(lock.ownerPath, "utf8");
		if (current === lock.ownerContent) {
			unlinkSync(lock.ownerPath);
		}
	} catch {}
	try {
		unlinkSync(lock.guardPath);
	} catch {}
}

export function withOwnerLock(workspaceRoot, lockName, fn) {
	const lock = ownerLock(workspaceRoot, lockName);
	if (!lock.acquired) {
		throw new Error(`Lock contention: could not acquire "${lockName}" — another process holds it`);
	}
	try {
		return fn();
	} finally {
		releaseOwnerLock(lock);
	}
}

function readOwnerRecord(ownerPath) {
	try {
		const stat = statSync(ownerPath);
		let pid = 0;
		try {
			const content = readFileSync(ownerPath, "utf8").trim();
			const [pidStr] = content.split(":");
			pid = parseInt(pidStr, 10);
		} catch {}
		if (!Number.isSafeInteger(pid) || pid <= 0) pid = 0;
		return { pid, uuid: "", ts: stat.mtimeMs };
	} catch {
		return null;
	}
}

function isStaleOwner(pid, ts) {
	const now = Date.now();
	if (now - ts < STALE_THRESHOLD_MS) return false;
	if (pid <= 0) return true;
	return !isPidAlive(pid);
}

function isPidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
