import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionBinding } from "./evidence-contract.js";

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

export async function executeHostCommand(request: HostExecutionRequest): Promise<HostExecutionResult> {
	const startedAt = new Date().toISOString();
	const toolCallId = request.toolCallId ?? randomUUID();
	let stdout = "";
	let stderr = "";
	let exitCode = 0;
	try {
		const result = await execFileAsync(request.command, [...(request.args ?? [])], {
			cwd: request.cwd,
			encoding: "utf8",
			timeout: request.timeoutMs ?? 120_000,
			maxBuffer: request.maxBuffer ?? 1024 * 1024,
			windowsHide: true,
		});
		stdout = result.stdout;
		stderr = result.stderr;
	} catch (error: unknown) {
		const failure = error as { stdout?: string; stderr?: string; code?: number | string };
		stdout = typeof failure.stdout === "string" ? failure.stdout : "";
		stderr = typeof failure.stderr === "string" ? failure.stderr : error instanceof Error ? error.message : String(error);
		exitCode = typeof failure.code === "number" ? failure.code : 1;
	}
	const finishedAt = new Date().toISOString();
	return {
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
}

export function fingerprintOutput(value: string): string {
	return fingerprint(value);
}
