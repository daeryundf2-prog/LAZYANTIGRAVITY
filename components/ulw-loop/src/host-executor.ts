import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { promisify } from "node:util";
import type { ExecutionBinding } from "./evidence-contract.js";
import { executionCommand, persistExecutionRecord } from "./execution-records.js";

const execFileAsync = promisify(execFile);

export interface HostExecutionRequest {
	readonly command: string;
	readonly args?: readonly string[];
	readonly cwd: string;
	readonly requestId: string;
	readonly runId: string;
	readonly sessionId: string;
	readonly toolCallId?: string;
	readonly timeoutMs?: number;
	readonly maxBuffer?: number;
}

export interface HostExecutionResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly binding: ExecutionBinding;
}

function fingerprint(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

async function execCommand(request: HostExecutionRequest) {
	const args = [...(request.args ?? [])];
	const opts = {
		cwd: request.cwd,
		encoding: "utf8" as const,
		timeout: request.timeoutMs ?? 120_000,
		maxBuffer: request.maxBuffer ?? 1024 * 1024,
		windowsHide: true,
	};
	try {
		return await execFileAsync(request.command, args, opts);
	} catch (error: unknown) {
		const code = (error as { code?: unknown }).code;
		// Windows에서 npm/npx 같은 .cmd shim은 shell 없이 실행할 수 없다 (Node >=18.20 EINVAL).
		// 확장자 없는 명령이 ENOENT/EINVAL로 실패하면 shell 경유로 한 번 재시도한다.
		if (
			process.platform === "win32" &&
			!/[.](exe|cmd|bat|com)$/i.test(request.command) &&
			(code === "ENOENT" || code === "EINVAL")
		) {
			// args 배열을 그대로 넘기면 이스케이프 없이 연결된다(DEP0190). 수동으로 인용한다.
			const quote = (v: string) => (/[\s"&|<>^]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
			const commandLine = [request.command, ...args].map(quote).join(" ");
			return await execFileAsync(commandLine, { ...opts, shell: true });
		}
		throw error;
	}
}

export async function executeHostCommand(request: HostExecutionRequest): Promise<HostExecutionResult> {
	const startedAt = new Date().toISOString();
	const toolCallId = request.toolCallId ?? randomUUID();
	let stdout = "";
	let stderr = "";
	let exitCode = 0;
	try {
		const result = await execCommand(request);
		stdout = result.stdout;
		stderr = result.stderr;
	} catch (error: unknown) {
		const failure = error as { stdout?: string; stderr?: string; code?: number | string };
		stdout = typeof failure.stdout === "string" ? failure.stdout : "";
		stderr =
			typeof failure.stderr === "string" ? failure.stderr : error instanceof Error ? error.message : String(error);
		exitCode = typeof failure.code === "number" ? failure.code : 1;
	}
	const finishedAt = new Date().toISOString();
	const result: HostExecutionResult = {
		stdout,
		stderr,
		exitCode,
		binding: {
			requestId: request.requestId,
			runId: request.runId,
			sessionId: request.sessionId,
			toolCallId,
			startedAt,
			finishedAt,
			exitCode,
			stdoutFingerprint: fingerprint(stdout),
			stderrFingerprint: fingerprint(stderr),
		},
	};
	persistExecutionRecord({
		workspaceRoot: realpathSync(request.cwd),
		commandFingerprint: fingerprint(executionCommand(request.command, request.args ?? [])),
		binding: result.binding,
	});
	return result;
}

export function fingerprintOutput(value: string): string {
	return fingerprint(value);
}
