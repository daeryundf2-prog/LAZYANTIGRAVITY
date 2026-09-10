import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { join, resolve } from "node:path";
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { SharedBlackboard } from "./blackboard.js";
import { ensurePrivateDirectory, ensureToken, tokenMatches } from "./security.js";

export interface DaemonConfig {
	socketPath: string;
	pidPath: string;
	tokenPath: string;
}

// 소비된 뮤테이션 논스의 보관 한도. 원장(파일·메모리)이 무한히 자라는 것을 막는다.
const NONCE_LEDGER_LIMIT = 4096;
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
			// win32 ACL 한계: chmod는 POSIX 모드 비트 흉내에 불과해 실제 ACL을
			// 강화하지 못하므로 win32에서는 스킵한다.
			if (process.platform !== "win32") {
				try {
					chmodSync(this.nonceLedgerPath, 0o600);
				} catch {
					// chmod 미지원 파일시스템에서는 생성 시 mode 비트에 의존한다.
				}
			}
			this.pruneNonceLedger();
		} catch {
			this.consumedRequestIds.delete(requestId);
			throw new Error("Unable to persist mutation nonce");
		}
	}

	private pruneNonceLedger(): void {
		// 논스 원장은 append-only로 무한히 자란다. 한도를 넘기면 최근 절반만
		// 남기고 원장을 재작성한다(재사용 방지 창은 충분히 유지된다).
		if (this.consumedRequestIds.size <= NONCE_LEDGER_LIMIT) return;
		const kept = [...this.consumedRequestIds].slice(-NONCE_LEDGER_LIMIT / 2);
		this.consumedRequestIds = new Set(kept);
		writeFileSync(this.nonceLedgerPath, kept.map((id) => `${id}\n`).join(""), { encoding: "utf8", mode: 0o600 });
		// win32 ACL 한계: 위와 동일하게 POSIX chmod는 스킵한다.
		if (process.platform !== "win32") {
			try {
				chmodSync(this.nonceLedgerPath, 0o600);
			} catch {
				// chmod 미지원 파일시스템에서는 생성 시 mode 비트에 의존한다.
			}
		}
	}

	// win32에서 네임드파이프는 "존재 = 살아 있는 서버"다. pid 파일만으로는
	// 재사용된 pid를 오판할 수 있으므로 실제로 응답하는지 확인한다(토큰 없는
	// PING도 Unauthorized 응답을 돌려주므로 생존 신호가 된다).
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
			// TOCTOU 유의: 위 alive 판정과 아래 unlink/listen 사이에 다른 프로세스가
			// 바인드할 수 있다. listen의 EADDRINUSE가 최종 판정이므로, 여기서의
			// 재확인(probeExistingPipe/isExistingDaemonAlive)은 stale 잔재를 치우는
			// best-effort 정리로만 취급한다.
			try { unlinkSync(this.config.socketPath); } catch { /* listen reports protected sockets */ }
		}

		await new Promise<void>((resolve, reject) => {
			this.server = createServer((socket) => this.handleConnection(socket));

			this.server.on("error", (err) => reject(err));

			this.server.listen(this.config.socketPath, () => {
				// win32 ACL 한계: 네임드파이프/파일에 POSIX chmod 의미가 없어 스킵한다.
				if (process.platform !== "win32") {
					try {
						chmodSync(this.config.socketPath, 0o600);
					} catch {
						// chmod 미지원 파일시스템에서는 생성 시 mode 비트에 의존한다.
					}
				}
				writeFileSync(this.config.pidPath, `${String(process.pid)}:${String(Date.now())}`, { encoding: "utf8", mode: 0o600 });
				if (process.platform !== "win32") {
					try {
						chmodSync(this.config.pidPath, 0o600);
					} catch {
						// chmod 미지원 파일시스템에서는 생성 시 mode 비트에 의존한다.
					}
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
			// 개행 없는 입력(또는 비정상 클라이언트)이 버퍼를 무한히 밀어넣지
			// 못하게 한다 — 라인 단위 프로토콜이니 한도를 넘는 연결은 폐기한다.
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
			// pid 파일 형식: "<pid>:<startTimeMs>" (구형 "<pid>"도 허용).
			const raw = readFileSync(this.config.pidPath, "utf8").trim().split(":")[0];
			const pid = Number.parseInt(raw, 10);
			if (!Number.isInteger(pid) || pid <= 0) return false;
			process.kill(pid, 0);
			// pid 재사용 오판 완화: pid 파일 mtime이 stale 한도를 넘으면 죽은
			// 데몬의 잔재로 보고 unlink 후 미존재로 판정한다. kill(pid,0) 성공
			// 직후에도 pid 재사용 가능성은 남으므로, listen의 EADDRINUSE와
			// 실제 소켓 응답이 최종 판정이다.
			try {
				const mtime = statSync(this.config.pidPath).mtimeMs;
				if (Number.isFinite(mtime) && Date.now() - mtime > PID_STALE_MS) {
					try { unlinkSync(this.config.pidPath); } catch { /* best-effort */ }
					return false;
				}
			} catch {
				// mtime을 읽을 수 없으면 kill 판정을 그대로 따른다.
			}
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
