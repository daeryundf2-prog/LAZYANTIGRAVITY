import { randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
export function hardenWindowsAcl(targetPath) {
    if (process.platform !== "win32")
        return;
    try {
        const user = process.env.USERNAME || process.env.USER;
        if (!user)
            return;
        execFileSync("icacls", [targetPath, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`], {
            stdio: "ignore",
            timeout: 5000,
            windowsHide: true,
        });
    }
    catch {
        // Best-effort; do not fail if icacls is unavailable or user lacks rights
    }
}
export function ensurePrivateDirectory(path) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    if (process.platform === "win32") {
        hardenWindowsAcl(path);
    }
    else {
        try {
            chmodSync(path, 0o700);
        }
        catch {
            // The directory may be on a filesystem without chmod support.
        }
    }
}
export function ensureToken(path) {
    if (!existsSync(path)) {
        const fd = openSync(path, "wx", 0o600);
        try {
            writeFileSync(fd, randomBytes(32).toString("hex"), "utf8");
        }
        finally {
            closeSync(fd);
        }
    }
    if (process.platform === "win32") {
        hardenWindowsAcl(path);
    }
    else {
        try {
            chmodSync(path, 0o600);
        }
        catch {
            // The token file may be on a filesystem without chmod support.
        }
    }
}
export function tokenMatches(expected, received) {
    if (typeof received !== "string")
        return false;
    const expectedBytes = Buffer.from(expected);
    const receivedBytes = Buffer.from(received);
    return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}
