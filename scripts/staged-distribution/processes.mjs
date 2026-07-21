import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readlinkSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";

export const MAX_TRANSCRIPT_BYTES = 65_536;
export const PROCESS_STAGE_TIMEOUT_MS = 2_000;
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = Object.freeze(["2025-06-18", "2024-11-05"]);

const REQUEST_TIMEOUT_MS = 5_000;
const NOTIFICATION_SILENCE_MS = 100;

export class ProcessContractError extends Error {
	name = "ProcessContractError";
}

export class HookOutputError extends ProcessContractError {
	name = "HookOutputError";
}

export class McpProtocolError extends ProcessContractError {
	name = "McpProtocolError";
}

export function validateHookOutput(event, stdout) {
	if (typeof stdout !== "string" || Buffer.byteLength(stdout, "utf8") > MAX_TRANSCRIPT_BYTES) {
		throw new HookOutputError("hook transcript exceeds the bounded output contract");
	}
	if (!/^[^\r\n]+\r?\n$/.test(stdout)) {
		throw new HookOutputError("hook output must contain exactly one newline-terminated JSON line");
	}
	let parsed;
	try {
		parsed = JSON.parse(stdout.trimEnd());
	} catch (error) {
		throw new HookOutputError("hook output is not valid JSON", { cause: error });
	}
	if (!isRecord(parsed)) throw new HookOutputError("hook output has an invalid shape");
	if (event === "PreInvocation") {
		if (Object.keys(parsed).length === 0 || isCurrentInjection(parsed)) return parsed;
		throw new HookOutputError("PreInvocation hook output has an invalid shape");
	}
	if (event === "Stop") {
		if (Object.keys(parsed).length === 1 && parsed.decision === "stop") return parsed;
		if (isCurrentContinuation(parsed)) return parsed;
		throw new HookOutputError("Stop hook output has an invalid shape");
	}
	throw new HookOutputError(`unsupported hook event: ${String(event)}`);
}

export async function spawnLiteralNode({ nodePath = process.execPath, argv, cwd, env = process.env }) {
	validateSpawnOptions({ nodePath, argv, cwd, env });
	const child = spawn(nodePath, argv, {
		cwd,
		env,
		shell: false,
		detached: process.platform !== "win32",
		stdio: ["pipe", "pipe", "pipe"],
		windowsHide: true,
	});
	const stdout = collectBounded(child.stdout, "stdout");
	const stderr = collectBounded(child.stderr, "stderr");
	const closed = new Promise((complete) => child.once("close", (exitCode, signal) => complete({ exitCode, signal })));
	await new Promise((complete, reject) => {
		child.once("spawn", complete);
		child.once("error", reject);
	});
	const spawnedIdentity = readProcessIdentity(child.pid);
	return { child, nodePath, argv: [...argv], stdout, stderr, closed, spawnedPid: child.pid, spawnedIdentity };
}

export async function closeOwnedProcess(handle, dependencies) {
	const stages = ["stdin-close"];
	if (!handle.child.stdin.destroyed && !handle.child.stdin.writableEnded) handle.child.stdin.end();
	let exit = await settledWithin(handle.closed, PROCESS_STAGE_TIMEOUT_MS);
	if (exit !== null) return cleanupReceipt("stdin-close", stages, exit, false);
	stages.push("term");
	const treeVerified = terminateOwnedProcess(handle, "SIGTERM", dependencies);
	exit = await settledWithin(handle.closed, PROCESS_STAGE_TIMEOUT_MS);
	if (exit !== null) return cleanupReceipt("term", stages, exit, treeVerified);
	stages.push("kill");
	const killVerified = terminateOwnedProcess(handle, "SIGKILL", dependencies);
	exit = await settledWithin(handle.closed, PROCESS_STAGE_TIMEOUT_MS);
	if (exit === null) throw new ProcessContractError("owned child remained hung after stdin-close, TERM, and KILL");
	return cleanupReceipt("kill", stages, exit, treeVerified || killVerified);
}

export async function runBoundedNodeProcess(options, { spawnProcess = spawnLiteralNode } = {}) {
	validateSpawnOptions(options);
	if (typeof options.stdin !== "string" && !Buffer.isBuffer(options.stdin ?? "")) {
		throw new TypeError("stdin must be a string or Buffer");
	}
	const handle = await spawnProcess(options);
	if (!handle.child.stdin.destroyed) handle.child.stdin.end(options.stdin ?? "");
	const cleanup = await closeOwnedProcess(handle);
	const receipt = makeReceipt(handle, cleanup);
	assertBounded(handle, receipt);
	return { stdout: handle.stdout.text(), stderr: handle.stderr.text(), receipt };
}

export async function runHookProcess({
	nodePath = process.execPath,
	hookPath,
	event,
	input,
	cwd,
	env = process.env,
}) {
	assertAbsoluteFilePath(hookPath, "hookPath");
	if (event !== "PreInvocation" && event !== "Stop") throw new HookOutputError("unsupported hook event");
	if (typeof input !== "string") throw new TypeError("hook input must be a string");
	const result = await runBoundedNodeProcess({ nodePath, argv: [hookPath, event], cwd, env, stdin: input });
	if (result.receipt.exitCode !== 0 || result.receipt.signal !== null || result.stderr !== "") {
		throw new ProcessContractError("hook process failed or emitted stderr", { cause: receiptError(result.receipt) });
	}
	return { output: validateHookOutput(event, result.stdout), ...result };
}

export async function runMcpLifecycle({
	nodePath = process.execPath,
	serverPath,
	args = [],
	cwd,
	env = process.env,
	protocolVersion = "2025-06-18",
	safeCall = null,
	requestTimeoutMs = REQUEST_TIMEOUT_MS,
}, { spawnProcess = spawnLiteralNode } = {}) {
	assertAbsoluteFilePath(serverPath, "serverPath");
	if (!SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(protocolVersion)) {
		throw new McpProtocolError(`unsupported MCP protocol version: ${String(protocolVersion)}`);
	}
	if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new TypeError("args must be a string array");
	validateSpawnOptions({ nodePath, argv: [serverPath, ...args], cwd, env });
	if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw new TypeError("requestTimeoutMs must be positive");
	if (safeCall !== null) validateSafeCallShape(safeCall);
	const handle = await spawnProcess({ nodePath, argv: [serverPath, ...args], cwd, env });
	const reader = createNdjsonReader(handle);
	let cleanup;
	try {
		const initialize = await transact(handle, reader, 1, "initialize", {
			protocolVersion,
			capabilities: {},
			clientInfo: { name: "lazyantigravity-staged-validator", version: "1.0.0" },
		}, requestTimeoutMs);
		const negotiated = initialize.result?.protocolVersion;
		if (!SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(negotiated)) {
			throw new McpProtocolError(`server negotiated unsupported MCP protocol version: ${String(negotiated)}`);
		}
		writeNdjson(handle, { jsonrpc: "2.0", method: "notifications/initialized" });
		await reader.expectSilence(NOTIFICATION_SILENCE_MS);
		const toolsList = await transact(handle, reader, 2, "tools/list", undefined, requestTimeoutMs);
		if (!Array.isArray(toolsList.result?.tools)) throw new McpProtocolError("tools/list result must contain a tools array");
		let toolCall = null;
		if (safeCall !== null) {
			const call = parseSafeCall(safeCall, toolsList.result.tools);
			toolCall = await transact(handle, reader, 3, "tools/call", call, requestTimeoutMs);
		}
		cleanup = await closeOwnedProcess(handle);
		const receipt = makeReceipt(handle, cleanup);
		assertBounded(handle, receipt);
		return { protocolVersion: negotiated, initialize, toolsList, toolCall, receipt };
	} finally {
		if (cleanup === undefined && handle.child.exitCode === null && handle.child.signalCode === null) {
			await closeOwnedProcess(handle);
		}
	}
}

function collectBounded(stream, label) {
	const chunks = [];
	const hash = createHash("sha256");
	let bytes = 0;
	let retainedBytes = 0;
	let overflow = false;
	stream.on("data", (chunk) => {
		const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		hash.update(data);
		bytes += data.length;
		const retained = Math.max(0, MAX_TRANSCRIPT_BYTES - retainedBytes);
		if (retained > 0) {
			const bounded = data.subarray(0, retained);
			chunks.push(bounded);
			retainedBytes += bounded.length;
		}
		if (bytes > MAX_TRANSCRIPT_BYTES) overflow = true;
	});
	return {
		label,
		get bytes() { return bytes; },
		get overflow() { return overflow; },
		text: () => Buffer.concat(chunks).toString("utf8"),
		digest: () => hash.digest("hex"),
	};
}

function createNdjsonReader(handle) {
	let buffer = "";
	const lines = [];
	const waiters = [];
	handle.child.stdout.setEncoding("utf8");
	handle.child.stdout.on("data", (chunk) => {
		if (handle.stdout.overflow) return failWaiters(new ProcessContractError("stdout transcript exceeded the byte cap"));
		buffer += chunk;
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			lines.push(buffer.slice(0, newline).replace(/\r$/, ""));
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");
		}
		flushWaiters();
	});
	function flushWaiters() {
		while (lines.length > 0 && waiters.length > 0) waiters.shift().resolve(lines.shift());
	}
	function failWaiters(error) {
		while (waiters.length > 0) waiters.shift().reject(error);
	}
	return {
		next(timeoutMs) {
			if (lines.length > 0) return Promise.resolve(lines.shift());
			return new Promise((resolve, reject) => {
				const waiter = { resolve, reject };
				waiters.push(waiter);
				setTimeout(() => {
					const index = waiters.indexOf(waiter);
					if (index !== -1) waiters.splice(index, 1);
					reject(new McpProtocolError(`timed out waiting for NDJSON response after ${timeoutMs}ms`));
				}, timeoutMs).unref();
			});
		},
		async expectSilence(timeoutMs) {
			try {
				const line = await this.next(timeoutMs);
				throw new McpProtocolError(`initialized notification received an illegal response: ${line.slice(0, 80)}`);
			} catch (error) {
				if (error instanceof McpProtocolError && error.message.startsWith("timed out")) return;
				throw error;
			}
		},
	};
}

async function transact(handle, reader, id, method, params, timeoutMs) {
	const message = params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params };
	writeNdjson(handle, message);
	const line = await reader.next(timeoutMs);
	if (line.length === 0 || line.startsWith("Content-Length:")) throw new McpProtocolError("MCP stdout is not strict NDJSON");
	let response;
	try { response = JSON.parse(line); } catch (error) { throw new McpProtocolError("MCP response is malformed JSON", { cause: error }); }
	if (!isRecord(response) || response.jsonrpc !== "2.0" || response.id !== id) {
		throw new McpProtocolError(`MCP ${method} returned a noisy or mismatched response`);
	}
	if (Object.hasOwn(response, "error")) throw new McpProtocolError(`MCP ${method} returned an error response`);
	if (!Object.hasOwn(response, "result")) throw new McpProtocolError(`MCP ${method} response has an invalid shape`);
	return response;
}

function writeNdjson(handle, value) {
	if (!handle.child.stdin.writable || handle.child.stdin.destroyed) throw new McpProtocolError("MCP server closed stdin unexpectedly");
	handle.child.stdin.write(`${JSON.stringify(value)}\n`);
}

function parseSafeCall(value, tools) {
	validateSafeCallShape(value);
	if (!tools.some((tool) => isRecord(tool) && tool.name === value.name)) {
		throw new McpProtocolError("safeCall tool was not advertised by tools/list");
	}
	return { name: value.name, arguments: value.arguments ?? {} };
}

function validateSafeCallShape(value) {
	if (!isRecord(value) || typeof value.name !== "string" || !isRecord(value.arguments ?? {})) {
		throw new McpProtocolError("safeCall must contain a tool name and plain-object arguments");
	}
}

export function terminateOwnedProcess(handle, signal, {
	platform = process.platform,
	processKill = process.kill,
	readIdentity = readProcessIdentity,
	taskkill = runTaskkill,
} = {}) {
	const actual = readIdentity(handle.child.pid);
	if (!isVerifiedChild(handle, actual)) {
		throw new ProcessContractError("refusing to terminate an unverified process tree");
	}
	if (platform !== "win32") {
		try { processKill(-handle.child.pid, signal); } catch (error) { if (error?.code !== "ESRCH") throw error; }
		return true;
	}
	const result = taskkill(handle.child.pid);
	if (result.error || (result.status !== 0 && handle.child.exitCode === null)) {
		throw new ProcessContractError("verified Windows process-tree termination failed", { cause: result.error });
	}
	return true;
}

function runTaskkill(pid) {
	return spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { shell: false, windowsHide: true, encoding: "utf8" });
}

function readProcessIdentity(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return null;
	if (process.platform === "win32") return readWindowsIdentity(pid);
	if (process.platform === "linux") return readLinuxIdentity(pid);
	const result = spawnSync("ps", ["-ww", "-p", String(pid), "-o", "pid=", "-o", "ppid=", "-o", "lstart=", "-o", "command="], { shell: false, encoding: "utf8" });
	if (result.status !== 0 || result.stdout.trim() === "") return null;
	const match = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+)$/.exec(result.stdout.trim());
	if (match === null) return null;
	const commandLine = match[4];
	return { pid: Number(match[1]), parent: Number(match[2]), created: match[3], exe: commandExecutable(commandLine), commandLine };
}

function readWindowsIdentity(pid) {
	const command = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\";if($null-ne $p){[pscustomobject]@{pid=[int]$p.ProcessId;parent=[int]$p.ParentProcessId;created=$p.CreationDate.ToUniversalTime().ToString('o');exe=[string]$p.ExecutablePath;commandLine=[string]$p.CommandLine}|ConvertTo-Json -Compress}`;
	const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { shell: false, windowsHide: true, encoding: "utf8" });
	if (result.status !== 0 || result.stdout.trim() === "") return null;
	try { return JSON.parse(result.stdout); } catch { return null; }
}

function readLinuxIdentity(pid) {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
		const commandLine = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
		return {
			pid,
			parent: Number(fields[1]),
			created: fields[19],
			exe: readlinkSync(`/proc/${pid}/exe`),
			commandLine,
		};
	} catch { return null; }
}

function commandExecutable(commandLine) {
	const first = /^"([^"]+)"|^(\S+)/.exec(commandLine);
	return first?.[1] ?? first?.[2] ?? "";
}

function isVerifiedChild(handle, actual) {
	const expected = handle.spawnedIdentity;
	return actual !== null && expected !== null && handle.child.pid === handle.spawnedPid &&
		actual.pid === handle.spawnedPid && expected.pid === handle.spawnedPid &&
		expected.parent === process.pid && actual.parent === expected.parent && actual.created === expected.created &&
		resolve(expected.exe).toLowerCase() === resolve(handle.nodePath).toLowerCase() &&
		resolve(actual.exe).toLowerCase() === resolve(expected.exe).toLowerCase() && actual.commandLine === expected.commandLine;
}

function makeReceipt(handle, cleanup) {
	const stdoutSha256 = handle.stdout.digest();
	const stderrSha256 = handle.stderr.digest();
	const hash = sha256(`${stdoutSha256}:${stderrSha256}`);
	return Object.freeze({
		pid: handle.child.pid,
		argv: Object.freeze([basename(handle.nodePath), ...handle.argv.map(sanitizeArg)]),
		exitCode: cleanup.exitCode,
		signal: cleanup.signal,
		hash,
		stdoutSha256,
		stderrSha256,
		stdoutBytes: handle.stdout.bytes,
		stderrBytes: handle.stderr.bytes,
		cleanup: Object.freeze(cleanup),
	});
}

function assertBounded(handle, receipt) {
	if (handle.stdout.overflow || handle.stderr.overflow) throw new ProcessContractError("process transcript exceeded the byte cap", { cause: receiptError(receipt) });
	if (!receipt.cleanup.exited) throw new ProcessContractError("owned child cleanup did not complete", { cause: receiptError(receipt) });
}

function cleanupReceipt(method, stages, exit, ownedTreeVerified) {
	return { method, stages: Object.freeze([...stages]), exited: true, exitCode: exit.exitCode, signal: exit.signal, ownedTreeVerified };
}

async function settledWithin(promise, timeoutMs) {
	return Promise.race([promise, new Promise((complete) => setTimeout(() => complete(null), timeoutMs))]);
}

function sanitizeArg(value) {
	if (value.includes("/") || value.includes("\\")) return basename(value);
	return /^[A-Za-z0-9._:@-]{1,64}$/.test(value) ? value : `<redacted:${sha256(value).slice(0, 12)}>`;
}

function receiptError(receipt) {
	return new ProcessContractError(`pid=${receipt.pid} exit=${String(receipt.exitCode)} signal=${String(receipt.signal)} hash=${receipt.hash}`);
}

function assertAbsoluteFilePath(value, name) {
	if (typeof value !== "string" || value.length === 0 || !isAbsolute(value)) throw new TypeError(`${name} must be an absolute path`);
}

function validateSpawnOptions({ nodePath = process.execPath, argv, cwd, env = process.env }) {
	assertAbsoluteFilePath(nodePath, "nodePath");
	if (!Array.isArray(argv) || argv.length === 0 || argv.some((value) => typeof value !== "string")) {
		throw new TypeError("argv must be a non-empty string array");
	}
	assertAbsoluteFilePath(cwd, "cwd");
	if (!isRecord(env)) throw new TypeError("env must be a plain object");
}

function isCurrentInjection(value) {
	return Object.keys(value).length === 1 && Array.isArray(value.injectSteps) && value.injectSteps.length === 1 &&
		isRecord(value.injectSteps[0]) && Object.keys(value.injectSteps[0]).length === 1 &&
		typeof value.injectSteps[0].ephemeralMessage === "string" && value.injectSteps[0].ephemeralMessage.length > 0;
}

function isCurrentContinuation(value) {
	return Object.keys(value).length === 2 && value.decision === "continue" && typeof value.reason === "string" &&
		/^lazyantigravity start-work continuation attempt [1-3]\/3$/.test(value.reason);
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}
