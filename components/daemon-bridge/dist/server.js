import { createServer } from "node:net";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SharedBlackboard } from "./blackboard.js";
export function getDaemonPaths(cwd = process.cwd()) {
    const runDir = join(cwd, ".lazyantigravity", "run");
    if (!existsSync(runDir)) {
        mkdirSync(runDir, { recursive: true });
    }
    const isWin = process.platform === "win32";
    const socketPath = isWin
        ? `\\\\.\\pipe\\lazyantigravity-daemon-${Buffer.from(cwd).toString("hex").slice(0, 16)}`
        : join(runDir, "daemon.sock");
    const pidPath = join(runDir, "daemon.pid");
    return { socketPath, pidPath };
}
export class DaemonServer {
    server = null;
    blackboard = new SharedBlackboard();
    config;
    startTime = Date.now();
    constructor(config) {
        this.config = config;
    }
    start() {
        return new Promise((resolve, reject) => {
            if (process.platform !== "win32" && existsSync(this.config.socketPath)) {
                try {
                    unlinkSync(this.config.socketPath);
                }
                catch { }
            }
            this.server = createServer((socket) => this.handleConnection(socket));
            this.server.on("error", (err) => {
                reject(err);
            });
            this.server.listen(this.config.socketPath, () => {
                writeFileSync(this.config.pidPath, String(process.pid), "utf8");
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
            catch { }
        }
        if (existsSync(this.config.pidPath)) {
            try {
                unlinkSync(this.config.pidPath);
            }
            catch { }
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
            const { cmd, key, value, options, namespace } = req;
            switch (cmd) {
                case "PING":
                    return { status: "ok", reply: "PONG", timestamp: Date.now() };
                case "STATUS":
                    return {
                        status: "ok",
                        pid: process.pid,
                        uptimeMs: Date.now() - this.startTime,
                        entriesCount: this.blackboard.size(),
                    };
                case "GET":
                    return { status: "ok", value: this.blackboard.get(key) };
                case "SET":
                    return { status: "ok", entry: this.blackboard.set(key, value, options) };
                case "DEL":
                    return { status: "ok", deleted: this.blackboard.delete(key) };
                case "LIST":
                    return { status: "ok", entries: this.blackboard.list(namespace) };
                case "CLEAR":
                    this.blackboard.clear();
                    return { status: "ok", cleared: true };
                default:
                    return { status: "error", error: `Unknown command: ${cmd}` };
            }
        }
        catch (err) {
            return { status: "error", error: err instanceof Error ? err.message : "Malformed JSON" };
        }
    }
}
