#!/usr/bin/env node
/**
 * AWT (Active Workflow Trimming) & Metacognitive Loop Breaker Hook
 * 
 * 1. AWT Guard: Detects trajectory drift when the agent deviates from initial task contracts.
 * 2. Loop Breaker: Intercepts meta-excuses (e.g. "흥미롭군요", "That's interesting") and aborts metacognitive failure loops.
 * 3. Stdin & Arg Reader: Handles both raw text and Antigravity/Codex JSON hook payloads.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot =
	process.env.PLUGIN_ROOT?.trim() ||
	process.env.LAZYANTIGRAVITY_ROOT?.trim() ||
	join(dirname(fileURLToPath(import.meta.url)), "..");

const cwd = process.env.OMO_REPO_ROOT?.trim() || process.cwd();

// Metacognitive Loop Breaker pattern (Korean & English)
const META_EXCUSE_REGEX = /(?:흥미롭군요|That['’]s interesting|예상과 다르게|왜 그런지 살펴봅시다|Let me think why that happened)/i;

async function readAllStdin() {
	return new Promise((resolve) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.once("end", () => resolve(data));
		process.stdin.once("error", () => resolve(""));
		if (process.stdin.isTTY) {
			resolve("");
		}
	});
}

async function main() {
	const stdinData = await readAllStdin();
	const cliArgs = process.argv.slice(2).join(" ");
	const fullPayload = `${cliArgs}\n${stdinData}`.trim();
	const lines = [];

	// 1. Inspect for Metacognitive Failure Loops
	if (META_EXCUSE_REGEX.test(fullPayload)) {
		lines.push(
			"LazyAntigravity METANARRATIVE ABORT: Detected metacognitive excuse pattern ('흥미롭군요' / 'That's interesting'). Do not verbalize excuses or spin in reflection loops. Output the concrete error stack and execute deterministic remediation directly."
		);
	}

	// 2. Active Workflow Trimming: Ensure Omniscient Mode and scope adherence
	lines.push(
		"LazyAntigravity AWT Contract: Assume agent is correct in Omniscient Mode. Do not engage in defensive over-exploration. If 1 degree of trajectory drift occurs from the task scope, trim immediately to the original contract vector."
	);

	process.stdout.write(
		`${JSON.stringify({
			additionalContext: lines.join("\n"),
		})}\n`
	);
}

main().catch(() => {
	process.stdout.write("{}\n");
});
