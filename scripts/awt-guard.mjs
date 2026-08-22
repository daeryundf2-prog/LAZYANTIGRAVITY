#!/usr/bin/env node
/**
 * AWT (Active Workflow Trimming) & Metacognitive Loop Breaker Hook
 * 
 * 1. AWT Guard: Detects trajectory drift when the agent deviates from initial task contracts.
 * 2. Loop Breaker: Intercepts meta-excuses (e.g. "흥미롭군요", "That's interesting") and aborts metacognitive failure loops.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot =
	process.env.PLUGIN_ROOT?.trim() ||
	process.env.LAZYANTIGRAVITY_ROOT?.trim() ||
	join(dirname(fileURLToPath(import.meta.url)), "..");

const cwd = process.env.OMO_REPO_ROOT?.trim() || process.cwd();
const lines = [];

// Metacognitive Loop Breaker pattern
const META_EXCUSE_REGEX = /(?:흥미롭군요|That['’]s interesting|예상과 다르게|왜 그런지 살펴봅시다|Let me think why that happened)/i;

// Inspect recent session log or stdin payload if available
const checkPayload = process.argv.slice(2).join(" ");
if (META_EXCUSE_REGEX.test(checkPayload)) {
	lines.push(
		"LazyAntigravity METANARRATIVE ABORT: Detected metacognitive excuse pattern ('흥미롭군요' / 'That's interesting'). Do not verbalize excuses or spin in reflection loops. Output the concrete error stack and execute deterministic remediation directly."
	);
}

// Active Workflow Trimming: Ensure Omniscient Mode and scope adherence
lines.push(
	"LazyAntigravity AWT Contract: Assume agent is correct in Omniscient Mode. Do not engage in defensive over-exploration. If 1 degree of trajectory drift occurs from the task scope, trim immediately to the original contract vector."
);

process.stdout.write(
	`${JSON.stringify({
		additionalContext: lines.join("\n"),
	})}\n`
);
