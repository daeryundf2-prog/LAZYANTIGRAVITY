import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { chmodSync, existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { SharedBlackboard } from "./blackboard.js";
import { NonceLedger } from "./nonce-ledger.js";
import { ensurePrivateDirectory, ensureToken, hardenWindowsAcl, tokenMatches } from "./security.js";

export interface DaemonConfig {
	socketPath: string;
	pidPath: string;
	tokenPath: string;
}

// 단일 커맨드 라인의 최대 길이. 개행 없는 입력이 버퍼를 무한히 밀어넣는 것을 막는다.
const MAX_LINE_BYTES = 1 << 20;
// pid 파일의 stale 판정 한도. mtime이 이보다 오래되면 죽은 데몬의 잔재로 보고 unlink한다.
const PID_STALE_MS = 5 * 60 * 1000;

export function getDaemonPaths(cwd: string = process.cwd()): DaemonConfig {
	const runDir = join(cwd, ".lazyantigravity", "run");
	ensurePrivateDirectory(runDir);

	const isWin = process.platform === "win32";
	const socketPath = isWin
		// 네임드파이프 이름은 전역 네임스페이스를 공유하므로 cwd 전체의 해시로
		// 유도해야 한다. cwd "첫 8바이트"를 쓰면 C:\Users\ 아래의 모든 프로젝트가
		// 같은 파이프명을 얻어 남의 워크스페이스 데몬과 충돌했다.
		? `\\\\.\\pipe\\lazyantigravity-daemon-${createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 32)}`
		: join(runDir, "daemon.sock");
	const pidPath = join(runDir, "daemon.pid");
	const tokenPath = join(runDir, "daemon.token");
	ensureToken(tokenPath);

	return { socketPath, pidPath, tokenPath };
}

export class DaemonServer {
	private server: Server | null = null;
	private blackboard = new SharedBlackboard();
	private config: DaemonConfig;
	private startTime = Date.now();
	private token: string;
	private nonceLedger: NonceLedger;
	private stopRequested = false;

	constructor(config: DaemonConfig) {
		this.config = config;
		ensureToken(config.tokenPath);
		this.token = readFileSync(config.tokenPath, "utf8").trim();
		this.nonceLedger = new NonceLedger(config.pidPath);
	}

	// win32에서 네임드파이프는 "존재 = 살아 있는 서버"다. pid 파일만으로는
	// 재사용된 pid를 오판할 수 있으므로 실제로 응답하는지 확인한다.
	private probeExistingPipe(): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = createConnection(this.config.socketPath);
			const done = (alive: boolean) => {
				clearTimeout(timer);
				socket.removeAllListeners();
				socket.destroy();
				resolve(alive);
			};
			const timer = setTimeout(() => done(false), 500);
			socket.on("connect", () => {
				socket.write(`${JSON.stringify({ cmd: "STATUS", token: "" })}\n`);
			});
			socket.on("data", () => done(true));
			socket.on("error", () => done(false));
		});
	}

	public async start(): Promise<void> {
		if (process.platform === "win32") {
			const alive = await this.probeExistingPipe();
			if (alive) throw new Error("An active daemon already owns this workspace");
		} else if (existsSync(this.config.socketPath)) {
			if (this.isExistingDaemonAlive()) {
				throw new Error("An active daemon already owns this workspace");
			}
			try { unlinkSync(this.config.socketPath); } catch { /* listen reports protected sockets */ }
		}

		await new Promise<void>((resolve, reject) => {
			this.server = createServer((socket) => this.handleConnection(socket));
			this.server.on("error", (err) => reject(err));

			this.server.listen(this.config.socketPath, () => {
				if (process.platform === "win32") {
					hardenWindowsAcl(this.config.pidPath);
				} else {
					try {
						chmodSync(this.config.socketPath, 0o600);
					} catch { /* ignore */ }
				}
				writeFileSync(this.config.pidPath, `${String(process.pid)}:${String(Date.now())}`, { encoding: "utf8", mode: 0o600 });
				if (process.platform === "win32") {
					hardenWindowsAcl(this.config.pidPath);
				} else {
					try {
						chmodSync(this.config.pidPath, 0o600);
					} catch { /* ignore */ }
				}
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
			try { unlinkSync(this.config.socketPath); } catch { /* best-effort */ }
		}
		for (const path of [this.config.pidPath]) {
			if (existsSync(path)) {
				try { unlinkSync(path); } catch { /* best-effort */ }
			}
		}
	}

	private handleConnection(socket: Socket): void {
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk.toString("utf8");
			if (buffer.length > MAX_LINE_BYTES) {
				socket.destroy();
				return;
			}
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
			const raw = readFileSync(this.config.pidPath, "utf8").trim().split(":")[0];
			const pid = Number.parseInt(raw, 10);
			if (!Number.isInteger(pid) || pid <= 0) return false;
			process.kill(pid, 0);
			try {
				const mtime = statSync(this.config.pidPath).mtimeMs;
				if (Number.isFinite(mtime) && Date.now() - mtime > PID_STALE_MS) {
					try { unlinkSync(this.config.pidPath); } catch { /* best-effort */ }
					return false;
				}
			} catch { /* ignore */ }
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
				if (this.nonceLedger.has(requestId)) return { status: "error", error: "Replay rejected" };
				this.nonceLedger.record(requestId);
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
