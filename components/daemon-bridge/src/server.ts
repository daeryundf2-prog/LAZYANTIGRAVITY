import { createServer, Server, Socket } from "node:net";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SharedBlackboard } from "./blackboard.js";

export interface DaemonConfig {
	socketPath: string;
	pidPath: string;
}

export function getDaemonPaths(cwd: string = process.cwd()): DaemonConfig {
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
	private server: Server | null = null;
	private blackboard = new SharedBlackboard();
	private config: DaemonConfig;
	private startTime = Date.now();

	constructor(config: DaemonConfig) {
		this.config = config;
	}

	public start(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (process.platform !== "win32" && existsSync(this.config.socketPath)) {
				try {
					unlinkSync(this.config.socketPath);
				} catch {}
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

	public stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.server) {
				this.server.close(() => {
					this.cleanup();
					resolve();
				});
			} else {
				this.cleanup();
				resolve();
			}
		});
	}

	private cleanup(): void {
		if (process.platform !== "win32" && existsSync(this.config.socketPath)) {
			try {
				unlinkSync(this.config.socketPath);
			} catch {}
		}
		if (existsSync(this.config.pidPath)) {
			try {
				unlinkSync(this.config.pidPath);
			} catch {}
		}
	}

	private handleConnection(socket: Socket): void {
		let buffer = "";

		socket.on("data", (chunk) => {
			buffer += chunk.toString("utf8");
			let newlineIndex: number;

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

	private handleCommand(line: string): unknown {
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
		} catch (err: unknown) {
			return { status: "error", error: err instanceof Error ? err.message : "Malformed JSON" };
		}
	}
}
