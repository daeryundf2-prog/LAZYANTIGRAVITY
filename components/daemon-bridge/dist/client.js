import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { getDaemonPaths } from "./server.js";
export class DaemonClient {
    config;
    constructor(config) {
        this.config = config || getDaemonPaths();
    }
    isRunning() {
        // On Windows the config points at the named-pipe namespace, which only
        // lists pipes that a live server currently owns.
        return existsSync(this.config.socketPath);
    }
    async send(command, timeoutMs = 2000) {
        const token = readFileSync(this.config.tokenPath, "utf8").trim();
        return new Promise((resolve, reject) => {
            const socket = createConnection(this.config.socketPath);
            let responseData = "";
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error(`IPC daemon timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            socket.on("connect", () => {
                socket.write(`${JSON.stringify({ ...command, token, requestId: command["requestId"] ?? randomUUID() })}\n`);
            });
            socket.on("data", (chunk) => {
                responseData += chunk.toString("utf8");
                if (responseData.includes("\n")) {
                    clearTimeout(timer);
                    socket.end();
                    try {
                        resolve(JSON.parse(responseData.trim()));
                    }
                    catch (error) {
                        reject(error);
                    }
                }
            });
            socket.on("error", (error) => {
                clearTimeout(timer);
                reject(error);
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
