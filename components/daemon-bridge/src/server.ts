import { randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { SharedBlackboard } from "./blackboard.js";

export interface DaemonConfig {
	socketPath: string;
	pidPath: string;
	tokenPath: string;
}

function ensurePrivateDirectory(path: string): void {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	try {
		chmodSync(path, 0o700);
	} catch {
		// The directory may be on a filesystem without chmod support.
	}
}

function ensureToken(path: string): void {
	if (!existsSync(path)) {
		const fd = openSync(path, "wx", 0o600);
		try {
			writeFileSync(fd, randomBytes(32).toString("hex"), "utf8");
		} finally {
			closeSync(fd);
		}
	}
	chmodSync(path, 0o600);
}

export function getDaemonPaths(cwd: string = process.cwd()): DaemonConfig {
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

function tokenMatches(expected: string, received: unknown): boolean {
	if (typeof received !== "string") return false;
	const expectedBytes = Buffer.from(expected);
	const receivedBytes = Buffer.from(received);
	return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export class DaemonServer {
	private server: Server | null = null;
	private blackboard = new SharedBlackboard();
	private config: DaemonConfig;
	private startTime = Date.now();
	private token: string;
	private consumedRequestIds = new Set<string>();
	private nonceLedgerPath: string;
	private stopRequested = false;

	constructor(config: DaemonConfig) {
		this.config = config;
		ensureToken(config.tokenPath);
		this.token = readFileSync(config.tokenPath, "utf8").trim();
		this.nonceLedgerPath = `${config.pidPath}.nonces`;
		this.loadNonceLedger();
	}

	private loadNonceLedger(): void {
		if (!existsSync(this.nonceLedgerPath)) return;
		try {
			for (const line of readFileSync(this.nonceLedgerPath, "utf8").split(/\r?\n/)) {
				const id = line.trim();
				if (id) this.consumedRequestIds.add(id);
			}
		} catch { /* fail closed at request time if the ledger cannot be read */ }
	}

	private persistNonce(requestId: string): void {
		try {
			appendFileSync(this.nonceLedgerPath, `${requestId}\n`, { encoding: "utf8", mode: 0o600 });
			chmodSync(this.nonceLedgerPath, 0o600);
		} catch {
			this.consumedRequestIds.delete(requestId);
			throw new Error("Unable to persist mutation nonce");
		}
	}

	public start(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (process.platform !== "win32" && existsSync(this.config.socketPath)) {
				if (this.isExistingDaemonAlive()) {
					reject(new Error("An active daemon already owns this socket"));
					return;
				}
				try { unlinkSync(this.config.socketPath); } catch { /* listen reports protected sockets */ }
			}

			this.server = createServer((socket) => this.handleConnection(socket));

			this.server.on("error", (err) => reject(err));

			this.server.listen(this.config.socketPath, () => {
				if (process.platform !== "win32") chmodSync(this.config.socketPath, 0o600);
				writeFileSync(this.config.pidPath, String(process.pid), { encoding: "utf8", mode: 0o600 });
				chmodSync(this.config.pidPath, 0o600);
				resolve();
			});
		});
	}

	public stop(): Promise<void> {
		this.stopRequested = true;
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

	public isStopRequested(): boolean {
		return this.stopRequested;
	}

	private cleanup(): void {
		if (process.platform !== "win32" && existsSync(this.config.socketPath)) {
			try {
				unlinkSync(this.config.socketPath);
			} catch {
				// Best-effort cleanup.
			}
		}
		for (const path of [this.config.pidPath]) {
			if (existsSync(path)) {
				try {
					unlinkSync(path);
				} catch {
					// Best-effort cleanup.
				}
			}
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

	private isExistingDaemonAlive(): boolean {
		try {
			const pid = Number.parseInt(readFileSync(this.config.pidPath, "utf8").trim(), 10);
			if (!Number.isInteger(pid) || pid <= 0) return false;
			process.kill(pid, 0);
			return true;
		} catch { return false; }
	}

	private handleCommand(line: string): unknown {
		try {
			const req = JSON.parse(line) as Record<string, unknown>;
			if (!tokenMatches(this.token, req["token"])) return { status: "error", error: "Unauthorized" };
			const { cmd, key: rawKey, value, options: rawOptions, namespace: rawNamespace } = req;
			const requestId = typeof req["requestId"] === "string" ? req["requestId"] : undefined;
			if ((cmd === "SET" || cmd === "DEL" || cmd === "CLEAR") && requestId !== undefined) {
					if (this.consumedRequestIds.has(requestId)) return { status: "error", error: "Replay rejected" };
					this.consumedRequestIds.add(requestId);
					this.persistNonce(requestId);
			}
			const key = typeof rawKey === "string" ? rawKey : undefined;
			const namespace = typeof rawNamespace === "string" ? rawNamespace : rawNamespace === undefined ? undefined : null;
			const options = rawOptions === undefined ? undefined : rawOptions && typeof rawOptions === "object" && !Array.isArray(rawOptions) ? rawOptions as { ttlMs?: number; agentId?: string; namespace?: string } : null;
			switch (cmd) {
				case "PING": return { status: "ok", reply: "PONG", timestamp: Date.now() };
				case "STATUS": return { status: "ok", pid: process.pid, uptimeMs: Date.now() - this.startTime, entriesCount: this.blackboard.size() };
				case "GET": return key === undefined ? { status: "error", error: "key must be a string" } : { status: "ok", value: this.blackboard.get(key) };
				case "SET": return key === undefined || options === null ? { status: "error", error: "key and options are invalid" } : { status: "ok", entry: this.blackboard.set(key, value, options) };
				case "DEL": return key === undefined ? { status: "error", error: "key must be a string" } : { status: "ok", deleted: this.blackboard.delete(key) };
				case "LIST": return namespace === null ? { status: "error", error: "namespace must be a string" } : { status: "ok", entries: this.blackboard.list(namespace) };
				case "CLEAR": this.blackboard.clear(); return { status: "ok", cleared: true };
				case "STOP": {
					this.stopRequested = true;
					// Close asynchronously so the acknowledgment is written to the
					// socket first; the process exits once the loop drains.
					void this.stop();
					return { status: "ok", stopping: true };
				}
				default: return { status: "error", error: `Unknown command: ${String(cmd)}` };
			}
		} catch (err: unknown) {
			return { status: "error", error: err instanceof Error ? err.message : "Malformed JSON" };
		}
	}
}
