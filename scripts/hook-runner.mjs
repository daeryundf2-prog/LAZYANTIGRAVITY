import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function writeFallbackPayload(fallbackPayloadRaw, stdout, stderr) {
	if (stderr) process.stderr.write(stderr);
	if (fallbackPayloadRaw) {
		try {
			// Decode base64 or just use it raw if we passed it encoded to avoid arg parsing issues.
			// Assume it's base64 encoded JSON
			const decoded = Buffer.from(fallbackPayloadRaw, "base64").toString("utf8");
			process.stdout.write(decoded);
		} catch (e) {
			// fallback decoding failed, just exit 0
		}
	}
}

async function readAllStdin() {
	return new Promise((resolve) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.once("end", () => resolve(data));
		process.stdin.once("error", () => resolve("")); // ignore errors
		
		// If stdin is already ended or not piped
		if (process.stdin.isTTY) {
			resolve("");
		}
	});
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length < 4) {
		console.error("Usage: hook-runner.mjs <policy> <fallbackPayloadJson> <hitlEventName> <command> [args...]");
		process.exit(1);
	}

	const policy = args[0];
	const fallbackPayloadRaw = args[1] === "none" ? null : args[1];
	const hitlEventName = args[2] === "none" ? null : args[2];
	const command = args[3];
	const commandArgs = args.slice(4);

	// Read stdin fully to pass it down
	const stdinData = await readAllStdin();

	return new Promise((resolve) => {
		const child = spawn(command, commandArgs, {
			stdio: ["pipe", "pipe", "pipe"],
			shell: false,
		});

		let stdoutData = "";
		let stderrData = "";
		const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;

		child.stdout.on("data", (chunk) => {
			if (stdoutData.length + chunk.length > MAX_CAPTURE_BYTES) {
				stdoutData = stdoutData.slice(0, MAX_CAPTURE_BYTES);
				process.stderr.write(`[hook-runner] stdout truncated at ${MAX_CAPTURE_BYTES} bytes\n`);
				return;
			}
			stdoutData += chunk;
		});

		child.stderr.on("data", (chunk) => {
			if (stderrData.length + chunk.length > MAX_CAPTURE_BYTES) {
				stderrData = stderrData.slice(0, MAX_CAPTURE_BYTES);
				process.stderr.write(`[hook-runner] stderr truncated at ${MAX_CAPTURE_BYTES} bytes\n`);
				return;
			}
			stderrData += chunk;
		});

		// Pass stdin down
		child.stdin.on("error", () => {});
		if (stdinData) {
			child.stdin.write(stdinData);
		}
		child.stdin.end();

		child.on("close", (code) => {
			if (code === 0) {
				// Success
				process.stdout.write(stdoutData);
				process.stderr.write(stderrData);
				resolve(0);
				return;
			}

			// Failure occurred, enforce policy
			if (policy === "FAIL_OPEN") {
				// Suppress error, exit 0 but write stderr to enable diagnostics
				process.stderr.write(stderrData);
				resolve(0);
			} else if (policy === "FAIL_CLOSED") {
				// Forward error, exit 1
				process.stdout.write(stdoutData);
				process.stderr.write(stderrData);
				resolve(1);
			} else if (policy === "FAIL_SAFE") {
				// Return fallback payload, exit 0
				writeFallbackPayload(fallbackPayloadRaw, "", stderrData);
				resolve(0);
			} else if (policy === "HITL_REQUIRED") {
				// Parse stdin payload to get cwd and runId
				let cwd = process.cwd();
				let runId = "unknown";
				if (stdinData) {
					try {
						const parsed = JSON.parse(stdinData);
						if (parsed.cwd) cwd = parsed.cwd;
						if (parsed.session_id) runId = parsed.session_id;
					} catch (e) {}
				}
				
				// Log the event dynamically
				import(join(__dirname, "../components/ulw-loop/dist/control-plane.js")).then(({ appendRunEvent }) => {
					return appendRunEvent(cwd, runId, "parent.hitl_required", {
						hookEventName: hitlEventName || "unknown",
						reason: "Hook execution failed"
					});
				}).catch(() => {
					// Ignore if control-plane is not compiled or available
				}).finally(() => {
					const denyJson = {
						hookSpecificOutput: {
							hookEventName: "PreToolUse",
							permissionDecision: "deny",
							permissionDecisionReason: `HITL_REQUIRED: ${hitlEventName || "Human intervention needed"}`,
							additionalContext: "Hook execution failed. HITL required to proceed."
						}
					};
					process.stdout.write(JSON.stringify(denyJson) + "\n");
					resolve(0);
				});
			} else {
				// Default to FAIL_CLOSED
				process.stdout.write(stdoutData);
				process.stderr.write(stderrData);
				resolve(1);
			}
		});

		child.on("error", (err) => {
			if (policy === "FAIL_OPEN") resolve(0);
			else if (policy === "FAIL_SAFE") {
				writeFallbackPayload(fallbackPayloadRaw, "", `[hook-runner] spawn error: ${err.message}\n`);
				resolve(0);
			} else resolve(1);
		});
	}).then((code) => {
		process.exit(code);
	});
}

main();
