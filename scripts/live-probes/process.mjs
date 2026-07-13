import { spawn, spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, normalize } from "node:path";
import { TextDecoder } from "node:util";

const OUTPUT_LIMIT = 64 * 1024;
const WINDOWS_INSPECT_TIMEOUT_MS = 2_000;
const WINDOWS_KILL_TIMEOUT_MS = 5_000;

function appendBounded(current, chunk) {
	const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
	const remaining = OUTPUT_LIMIT - current.length;
	return remaining > 0 ? Buffer.concat([current, bytes.subarray(0, remaining)]) : current;
}

function decodeBounded(buffer) {
	const strict = new TextDecoder("utf-8", { fatal: true });
	for (let trim = 0; trim <= 3 && trim <= buffer.length; trim += 1) {
		try { return strict.decode(trim === 0 ? buffer : buffer.subarray(0, -trim)); }
		catch { /* A byte cap may split the final UTF-8 code point. */ }
	}
	return buffer.toString("utf8");
}

function canonicalPath(path) {
	if (!path) return null;
	try { return realpathSync(path); }
	catch { return normalize(path); }
}

function inspectWindowsProcess(pid, runSync) {
	const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
	const powershell = join(windowsRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
	const cimScript = [
		`$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'`,
		"if($null -eq $p){exit 3}",
		"[ordered]@{pid=[int]$p.ProcessId;parentPid=[int]$p.ParentProcessId;executable=$p.ExecutablePath;creationTime=$p.CreationDate.ToUniversalTime().ToString('o');commandLine=$p.CommandLine}|ConvertTo-Json -Compress",
	].join(";");
	const result = runSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", cimScript], {
		encoding: "utf8",
		windowsHide: true,
		timeout: WINDOWS_INSPECT_TIMEOUT_MS,
	});
	if (result.status !== 0 || !result.stdout) {
		const processScript = [
			`$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
			"if($null -eq $p){exit 3}",
			"[ordered]@{pid=[int]$p.Id;parentPid=$null;executable=$p.Path;creationTime=$p.StartTime.ToUniversalTime().ToString('o');commandLine=$null}|ConvertTo-Json -Compress",
		].join(";");
		const fallback = runSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", processScript], {
			encoding: "utf8",
			windowsHide: true,
			timeout: WINDOWS_INSPECT_TIMEOUT_MS,
		});
		if (fallback.status !== 0 || !fallback.stdout) return null;
		const identity = JSON.parse(fallback.stdout);
		return {
			pid: identity.pid,
			parentPid: identity.parentPid,
			executable: canonicalPath(identity.executable),
			creationTime: identity.creationTime,
			commandLine: identity.commandLine,
		};
	}
	const identity = JSON.parse(result.stdout);
	return {
		pid: identity.pid,
		parentPid: identity.parentPid,
		executable: canonicalPath(identity.executable),
		creationTime: identity.creationTime,
		commandLine: identity.commandLine,
	};
}

function inspectProcfsProcess(pid) {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
		return {
			pid,
			parentPid: Number.parseInt(fields[1], 10),
			executable: canonicalPath(`/proc/${pid}/exe`),
			creationTime: fields[19],
			commandLine: readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim(),
		};
	} catch {
		return null;
	}
}

export function inspectProcessIdentity(pid, dependencies = {}) {
	const platform = dependencies.platform ?? process.platform;
	if (!Number.isSafeInteger(pid) || pid <= 0) return null;
	if (platform === "win32") return inspectWindowsProcess(pid, dependencies.spawnSync ?? spawnSync);
	if (platform === "linux") return inspectProcfsProcess(pid);
	const result = (dependencies.spawnSync ?? spawnSync)("ps", ["-p", String(pid), "-o", "ppid=", "-o", "lstart=", "-o", "command="], {
		encoding: "utf8",
	});
	if (result.status !== 0 || !result.stdout.trim()) return null;
	const line = result.stdout.trim();
	const match = line.match(/^(\d+)\s+(.{24})\s+(.+)$/);
	return match ? { pid, parentPid: Number.parseInt(match[1], 10), executable: null, creationTime: match[2], commandLine: match[3] } : null;
}

function sameIdentity(bound, current) {
	if (!bound || !current) return false;
	for (const field of ["pid", "parentPid", "creationTime", "commandLine"]) {
		if (bound[field] !== current[field]) return false;
	}
	if (bound.executable === null || current.executable === null) return bound.executable === current.executable;
	return process.platform === "win32"
		? normalize(bound.executable).toLowerCase() === normalize(current.executable).toLowerCase()
		: normalize(bound.executable) === normalize(current.executable);
}

export async function terminateOwnedProcess(identity, dependencies = {}) {
	const platform = dependencies.platform ?? process.platform;
	const inspect = dependencies.inspect ?? ((pid) => inspectProcessIdentity(pid, { platform }));
	const current = inspect(identity?.pid);
	if (!sameIdentity(identity, current)) return { ok: false, method: "identity-mismatch" };
	if (platform === "win32") {
		const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
		const result = (dependencies.spawnSync ?? spawnSync)(join(windowsRoot, "System32", "taskkill.exe"), ["/PID", String(identity.pid), "/T", "/F"], {
			encoding: "utf8",
			windowsHide: true,
			timeout: dependencies.killTimeoutMs ?? WINDOWS_KILL_TIMEOUT_MS,
		});
		return { ok: result.status === 0, method: "taskkill-identity-checked-tree" };
	}
	const kill = dependencies.kill ?? process.kill.bind(process);
	try {
		kill(-identity.pid, "SIGKILL");
		return { ok: true, method: "identity-checked-process-group-sigkill" };
	} catch {
		const beforeFallback = inspect(identity.pid);
		if (!sameIdentity(identity, beforeFallback)) return { ok: false, method: "identity-mismatch" };
		try {
			kill(identity.pid, "SIGKILL");
			return { ok: true, method: "identity-rechecked-pid-sigkill" };
		} catch {
			return { ok: false, method: "identity-rechecked-pid-sigkill-failed" };
		}
	}
}

export function runBounded(options, terminate = terminateOwnedProcess) {
	return new Promise((resolve) => {
		let stdout = Buffer.alloc(0);
		let stderr = Buffer.alloc(0);
		let settled = false;
		let timedOut = false;
		let cleanup = null;
		const child = spawn(options.executable, options.args, {
			cwd: options.cwd,
			env: options.env,
			shell: false,
			windowsVerbatimArguments: options.windowsVerbatimArguments === true,
			windowsHide: true,
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
		});
		const identity = inspectProcessIdentity(child.pid);
		child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
		child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
		const timer = setTimeout(async () => {
			timedOut = true;
			cleanup = identity
				? await terminate(identity)
				: { ok: false, method: "spawn-identity-unavailable" };
			if (!settled) {
				settled = true;
				try { child.kill("SIGKILL"); }
				catch { /* The owned tree may already be gone. */ }
				child.unref();
				child.stdout.destroy();
				child.stderr.destroy();
				resolve({
					status: cleanup.ok ? "timed-out" : "cleanup-failed",
					exitCode: 1,
					pid: child.pid,
					stdout: decodeBounded(stdout),
					stderr: decodeBounded(stderr),
					cleanup,
				});
			}
		}, options.timeoutMs);
		child.once("error", (error) => {
			clearTimeout(timer);
			if (settled) return;
			settled = true;
			resolve({ status: "spawn-failed", exitCode: 1, pid: child.pid ?? null, stdout: decodeBounded(stdout), stderr: `${decodeBounded(stderr)}${error.message}`, cleanup: null });
		});
		child.once("close", (code, signal) => {
			clearTimeout(timer);
			if (settled) return;
			settled = true;
			resolve({
				status: timedOut ? "timed-out" : "exited",
				exitCode: timedOut ? 1 : (code ?? 1),
				pid: child.pid,
				stdout: decodeBounded(stdout),
				stderr: decodeBounded(stderr),
				signal,
				cleanup: timedOut ? cleanup : null,
			});
		});
	});
}
