import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import { getDaemonPaths } from "./server.js";
export class DaemonClient {
    config;
    constructor(config) {
        this.config = config || getDaemonPaths();
    }
    isRunning() {
        if (process.platform === "win32")
            return true; // Probe on connect
        return existsSync(this.config.socketPath);
    }
    async send(command, timeoutMs = 2000) {
        return new Promise((resolve, reject) => {
            const socket = createConnection(this.config.socketPath);
            let responseData = "";
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error(`IPC daemon timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            socket.on("connect", () => {
                socket.write(`${JSON.stringify(command)}\n`);
            });
            socket.on("data", (chunk) => {
                responseData += chunk.toString("utf8");
                if (responseData.includes("\n")) {
                    clearTimeout(timer);
                    socket.end();
                    try {
                        const res = JSON.parse(responseData.trim());
                        resolve(res);
                    }
                    catch (e) {
                        reject(e);
                    }
                }
            });
            socket.on("error", (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
    async get(key) {
        const res = await this.send({ cmd: "GET", key });
        return res.status === "ok" ? res.value : null;
    }
    async set(key, value, options) {
        const res = await this.send({ cmd: "SET", key, value, options });
        return res.status === "ok" ? res.entry : null;
    }
    async list(namespace) {
        const res = await this.send({ cmd: "LIST", namespace });
        return res.status === "ok" ? res.entries : [];
    }
    async status() {
        try {
            return await this.send({ cmd: "STATUS" });
        }
        catch {
            return null;
        }
    }
}
