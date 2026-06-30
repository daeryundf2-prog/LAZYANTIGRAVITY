import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
export function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === "EPERM";
    }
}
export function readLockPid(lockPath) {
    try {
        const pid = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
        return Number.isInteger(pid) ? pid : null;
    }
    catch {
        return null;
    }
}
export function tryAcquireLock(lockPath, ownerPid = process.pid) {
    mkdirSync(dirname(lockPath), { recursive: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const handle = writeLockFile(lockPath, ownerPid);
        if (handle)
            return handle;
        if (!reapStaleLock(lockPath))
            return null;
    }
    return null;
}
function writeLockFile(lockPath, ownerPid) {
    try {
        const fd = openSync(lockPath, "wx");
        writeSync(fd, `${ownerPid}\n`);
        closeSync(fd);
        return { release: () => unlinkQuietly(lockPath) };
    }
    catch (error) {
        if (error.code === "EEXIST")
            return null;
        throw error;
    }
}
function reapStaleLock(lockPath) {
    const pid = readLockPid(lockPath);
    if (pid !== null && isProcessAlive(pid))
        return false;
    unlinkQuietly(lockPath);
    return true;
}
export function unlinkQuietly(path) {
    try {
        unlinkSync(path);
    }
    catch (error) {
        void error;
    }
}
