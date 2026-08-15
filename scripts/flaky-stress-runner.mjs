#!/usr/bin/env node
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
let concurrency = 5;
let totalIterations = 20;
let testCommand = "";

for (let i = 0; i < args.length; i++) {
	if (args[i].startsWith("--concurrency=")) {
		concurrency = parseInt(args[i].split("=")[1], 10) || 5;
	} else if (args[i].startsWith("--iterations=")) {
		totalIterations = parseInt(args[i].split("=")[1], 10) || 20;
	} else {
		testCommand = args.slice(i).join(" ");
		break;
	}
}

if (!testCommand) {
	testCommand = "npm test";
}

console.log(`[Flaky-Stress-Runner] Target Command: "${testCommand}"`);
console.log(`[Flaky-Stress-Runner] Concurrency: ${concurrency}, Total Iterations: ${totalIterations}`);

let completed = 0;
let passed = 0;
let failed = 0;
const failureLogs = [];

function runSingleTest(iterationIndex) {
	return new Promise((resolve) => {
		// Add small random jitter (0-50ms) to provoke race conditions
		const jitter = Math.floor(Math.random() * 50);
		setTimeout(() => {
			let stdout = "";
			let stderr = "";
			const proc = spawn(testCommand, {
				shell: true,
				env: { ...process.env, CI: "true" },
			});

			proc.stdout?.on("data", (d) => { stdout += d.toString(); });
			proc.stderr?.on("data", (d) => { stderr += d.toString(); });

			proc.on("close", (code) => {
				completed++;
				if (code === 0) {
					passed++;
					process.stdout.write(`\r[Progress: ${completed}/${totalIterations}] PASS: ${passed}, FAIL: ${failed}`);
				} else {
					failed++;
					failureLogs.push({ iteration: iterationIndex, code, log: (stderr || stdout).slice(-500) });
					process.stdout.write(`\r[Progress: ${completed}/${totalIterations}] PASS: ${passed}, FAIL: ${failed}`);
				}
				resolve();
			});

			proc.on("error", (err) => {
				completed++;
				failed++;
				failureLogs.push({ iteration: iterationIndex, code: -1, log: err.message });
				resolve();
			});
		}, jitter);
	});
}

async function runPool() {
	const queue = Array.from({ length: totalIterations }, (_, i) => i + 1);
	const workers = Array.from({ length: concurrency }, async () => {
		while (queue.length > 0) {
			const iter = queue.shift();
			if (iter !== undefined) {
				await runSingleTest(iter);
			}
		}
	});

	await Promise.all(workers);
	console.log("\n");

	if (failed === 0) {
		console.log(`✅ [Flaky-Stress-Runner] SUCCESS: Deterministic stability verified (${passed}/${totalIterations} PASS).`);
		process.exit(0);
	} else {
		console.error(`❌ [Flaky-Stress-Runner] FLAKINESS DETECTED: ${failed}/${totalIterations} runs failed!`);
		console.error("\n=== Failure Samples ===");
		for (const fail of failureLogs.slice(0, 3)) {
			console.error(`--- Run #${fail.iteration} (Exit ${fail.code}) ---`);
			console.error(fail.log.trim());
		}
		process.exit(1);
	}
}

runPool();
