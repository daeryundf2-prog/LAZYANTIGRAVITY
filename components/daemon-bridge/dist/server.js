import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { createServer } from "node:net";
import { SharedBlackboard } from "./blackboard.js";
function ensurePrivateDirectory(path) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    try {
        chmodSync(path, 0o700);
    }
    catch {
        // The directory may be on a filesystem without chmod support.
    }
}
function ensureToken(path) {
    if (!existsSync(path)) {
        const fd = openSync(path, "wx", 0o600);
        try {
            writeFileSync(fd, randomBytes(32).toString("hex"), "utf8");
        }
        finally {
            closeSync(fd);
        }
    }
    chmodSync(path, 0o600);
}
export function getDaemonPaths(cwd = process.cwd()) {
    const runDir = join(cwd, ".lazyantigravity", "run");
    ensurePrivateDirectory(runDir);
    const isWin = process.platform === "win32";
    const socketPath = isWin
        ? `\\\\.\\pipe\\lazyantigravity-daemon-${Buffer.from(cwd).toString("hex").slice(0, 16)}`
        : join(runDir, "daemon.sock");
    const pidPath = join(runDir, "daemon.pid");
    const tokenPath = join(runDir, "daemon.token");
    ensureToken(tokenPath);
    return { socketPath, pidPath, tokenPath };
}
function tokenMatches(expected, received) {
    if (typeof received !== "string")
        return false;
    const expectedBytes = Buffer.from(expected);
    const receivedBytes = Buffer.from(received);
    return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}
export class DaemonServer {
    server = null;
    blackboard = new SharedBlackboard();
    config;
    startTime = Date.now();
    token;
    constructor(config) {
        this.config = config;
        ensureToken(config.tokenPath);
        this.token = readFileSync(config.tokenPath, "utf8").trim();
    }
    start() {
        return new Promise((resolve, reject) => {
            if (process.platform !== "win32" && existsSync(this.config.socketPath)) {
                try {
                    unlinkSync(this.config.socketPath);
                }
                catch {
                    // A live daemon or a protected socket must fail at listen below.
                }
            }
            this.server = createServer((socket) => this.handleConnection(socket));
            this.server.on("error", (err) => reject(err));
            this.server.listen(this.config.socketPath, () => {
                if (process.platform !== "win32")
                    chmodSync(this.config.socketPath, 0o600);
                writeFileSync(this.config.pidPath, String(process.pid), { encoding: "utf8", mode: 0o600 });
                chmodSync(this.config.pidPath, 0o600);
                resolve();
            });
        });
    }
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.cleanup();
                    resolve();
                });
            }
            else {
                this.cleanup();
                resolve();
            }
        });
    }
    cleanup() {
        if (process.platform !== "win32" && existsSync(this.config.socketPath)) {
            try {
                unlinkSync(this.config.socketPath);
            }
            catch {
                // Best-effort cleanup.
            }
        }
        for (const path of [this.config.pidPath]) {
            if (existsSync(path)) {
                try {
                    unlinkSync(path);
                }
                catch {
                    // Best-effort cleanup.
                }
            }
        }
    }
    handleConnection(socket) {
        let buffer = "";
        socket.on("data", (chunk) => {
            buffer += chunk.toString("utf8");
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (line.length > 0) {
                    const response = this.handleCommand(line);
                    socket.write(`${JSON.stringify(response)}\n`);
                }
            }
        });
    }
    handleCommand(line) {
        try {
            const req = JSON.parse(line);
            if (!tokenMatches(this.token, req["token"]))
                return { status: "error", error: "Unauthorized" };
            const { cmd, key: rawKey, value, options: rawOptions, namespace: rawNamespace } = req;
            const key = typeof rawKey === "string" ? rawKey : undefined;
            const namespace = typeof rawNamespace === "string" ? rawNamespace : rawNamespace === undefined ? undefined : null;
            const options = rawOptions === undefined ? undefined : rawOptions && typeof rawOptions === "object" && !Array.isArray(rawOptions) ? rawOptions : null;
            switch (cmd) {
                case "PING": return { status: "ok", reply: "PONG", timestamp: Date.now() };
                case "STATUS": return { status: "ok", pid: process.pid, uptimeMs: Date.now() - this.startTime, entriesCount: this.blackboard.size() };
                case "GET": return key === undefined ? { status: "error", error: "key must be a string" } : { status: "ok", value: this.blackboard.get(key) };
                case "SET": return key === undefined || options === null ? { status: "error", error: "key and options are invalid" } : { status: "ok", entry: this.blackboard.set(key, value, options) };
                case "DEL": return key === undefined ? { status: "error", error: "key must be a string" } : { status: "ok", deleted: this.blackboard.delete(key) };
                case "LIST": return namespace === null ? { status: "error", error: "namespace must be a string" } : { status: "ok", entries: this.blackboard.list(namespace) };
                case "CLEAR":
                    this.blackboard.clear();
                    return { status: "ok", cleared: true };
                default: return { status: "error", error: `Unknown command: ${String(cmd)}` };
            }
        }
        catch (err) {
            return { status: "error", error: err instanceof Error ? err.message : "Malformed JSON" };
        }
    }
}
