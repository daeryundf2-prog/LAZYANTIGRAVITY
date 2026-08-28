import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { DaemonConfig, getDaemonPaths } from "./server.js";
import { BlackboardEntry } from "./blackboard.js";

export class DaemonClient {
	private config: DaemonConfig;

	constructor(config?: DaemonConfig) {
		this.config = config || getDaemonPaths();
	}

	public isRunning(): boolean {
		// On Windows the config points at the named-pipe namespace, which only
		// lists pipes that a live server currently owns.
		return existsSync(this.config.socketPath);
	}

	public async send<T = unknown>(command: Record<string, unknown>, timeoutMs = 2000): Promise<T> {
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
					resolve(JSON.parse(responseData.trim()) as T);
				} catch (error) {
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

	public async get<T = unknown>(key: string): Promise<T | null> {
		const res = await this.send<{ status: string; value: T }>({ cmd: "GET", key });
		return res.status === "ok" ? res.value : null;
	}

	public async set<T = unknown>(key: string, value: T, options?: { ttlMs?: number; agentId?: string; namespace?: string }): Promise<BlackboardEntry<T> | null> {
		const res = await this.send<{ status: string; entry: BlackboardEntry<T> }>({ cmd: "SET", key, value, options });
		return res.status === "ok" ? res.entry : null;
	}

	public async list(namespace?: string): Promise<BlackboardEntry[]> {
		const res = await this.send<{ status: string; entries: BlackboardEntry[] }>({ cmd: "LIST", namespace });
		return res.status === "ok" ? res.entries : [];
	}

	public async status(): Promise<{ status: string; pid?: number; uptimeMs?: number; entriesCount?: number } | null> {
		try {
			return await this.send({ cmd: "STATUS" });
		} catch {
			return null;
		}
	}
}
