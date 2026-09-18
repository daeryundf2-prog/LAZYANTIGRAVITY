import { spawn } from "node:child_process";

let active = 0;
const queue = [];
const MAX_ACTIVE = 2;
const MAX_QUEUED = 8;

export async function runBoundedBinary(binary, args, timeoutMs, { maxStdout = 2 * 1024 * 1024 } = {}) {
	if (active >= MAX_ACTIVE) {
		if (queue.length >= MAX_QUEUED) return { ok: false, status: null, error: "Media subprocess queue full", stdout: "", stderr: "" };
		await new Promise((resume) => queue.push(resume));
	} else active++;
	try {
		return await new Promise((done) => {
			let child;
			try { child = spawn(binary, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] }); }
			catch (error) { done({ ok: false, status: null, error: error.message, stdout: "", stderr: "" }); return; }
			const output = { stdout: [], stderr: [] };
			let bytes = 0;
			let failure = null;
			const timer = setTimeout(() => { failure = "Subprocess timed out"; child.kill("SIGKILL"); }, timeoutMs);
			for (const name of ["stdout", "stderr"]) child[name].on("data", (chunk) => {
				bytes += chunk.length;
				if (bytes > maxStdout) { failure = "Subprocess output exceeded byte limit"; child.kill("SIGKILL"); }
				else output[name].push(chunk);
			});
			child.on("error", (error) => { failure = error.message; });
			child.on("close", (status, signal) => {
				clearTimeout(timer);
				done({ ok: status === 0 && !failure, status, signal, error: failure, stdout: Buffer.concat(output.stdout).toString("utf8"), stderr: Buffer.concat(output.stderr).toString("utf8") });
			});
		});
	} finally {
		const resume = queue.shift();
		if (resume) resume(); else active--;
	}
}
