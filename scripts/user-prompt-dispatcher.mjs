#!/usr/bin/env node
/**
 * Single-process dispatcher for the UserPromptSubmit hook event.
 *
 * Previously five node processes ran per user prompt (rules, quick-lane,
 * adaptive-reasoning, ultrawork, ulw-loop). This dispatcher imports each
 * component's hook handler in-process, preserves the hooks.json order, and
 * emits one combined hookSpecificOutput whose additionalContext is the
 * concatenation of every handler's contribution. A failing handler logs to
 * stderr and is skipped — it never blocks the others (fail-open per handler).
 */
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = process.env["PLUGIN_ROOT"]
	? resolve(process.env["PLUGIN_ROOT"])
	: dirname(dirname(fileURLToPath(import.meta.url)));

const { runUserPromptSubmitHook: runRulesHook } = await import(
	join(PLUGIN_ROOT, "components", "rules", "dist", "codex-hook.js")
);
const { runQuickLaneHook } = await import(
	join(PLUGIN_ROOT, "components", "quick-lane", "dist", "codex-hook.js")
);
const { handleUserPromptSubmitHook } = await import(
	join(PLUGIN_ROOT, "components", "adaptive-reasoning", "dist", "codex-hook.js")
);
const ultrawork = await import(
	join(PLUGIN_ROOT, "components", "ultrawork", "dist", "codex-hook.js")
);
const { applyUserPromptUlwLoopSteering } = await import(
	join(PLUGIN_ROOT, "components", "ulw-loop", "dist", "codex-hook.js")
);

const RULES_OPTIONS = { pluginDataRoot: process.env["PLUGIN_DATA"] || undefined };
const HANDLERS = [
	["rules", async (payload) => runRulesHook(payload, RULES_OPTIONS)],
	["quick-lane", async (payload) => runQuickLaneHook(payload)],
	["adaptive-reasoning", async (payload) => handleUserPromptSubmitHook(JSON.stringify(payload))],
	["ultrawork", async (payload) => ultrawork.runUserPromptSubmitHook(payload)],
	["ulw-loop", async (payload) => applyUserPromptUlwLoopSteering(payload)],
];

function extractAdditionalContext(result) {
	if (!result || typeof result !== "string" || result.trim().length === 0) return "";
	try {
		const parsed = JSON.parse(result);
		return parsed?.hookSpecificOutput?.additionalContext ?? "";
	} catch {
		return "";
	}
}

async function readStdin() {
	let data = "";
	if (process.stdin.isTTY) return data;
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) data += chunk;
	return data;
}

async function main() {
	const raw = await readStdin();
	let payload = {};
	try {
		payload = raw.trim().length > 0 ? JSON.parse(raw) : {};
	} catch (error) {
		process.stderr.write(`[user-prompt-dispatcher] malformed stdin JSON: ${error.message}\n`);
	}
	// Component gates require the full host field set; fill sane defaults so a
	// partially-shaped payload behaves exactly like a real host invocation.
	payload = {
		hook_event_name: "UserPromptSubmit",
		session_id: typeof payload.session_id === "string" && payload.session_id.length > 0 ? payload.session_id : "dispatcher-session",
		turn_id: typeof payload.turn_id === "string" ? payload.turn_id : "",
		transcript_path: typeof payload.transcript_path === "string" ? payload.transcript_path : null,
		cwd: typeof payload.cwd === "string" && payload.cwd.length > 0 ? payload.cwd : process.cwd(),
		model: typeof payload.model === "string" ? payload.model : "",
		permission_mode: typeof payload.permission_mode === "string" ? payload.permission_mode : "",
		source: typeof payload.source === "string" ? payload.source : "",
		prompt: typeof payload.prompt === "string" ? payload.prompt : "",
	};

	const contributions = [];
	for (const [name, handler] of HANDLERS) {
		try {
			const context = extractAdditionalContext(await handler(payload));
			if (context.length > 0) contributions.push(context);
		} catch (error) {
			process.stderr.write(`[user-prompt-dispatcher] handler '${name}' failed (skipped): ${error.message}\n`);
		}
	}

	const output = {
		hookSpecificOutput: {
			hookEventName: "UserPromptSubmit",
			additionalContext: contributions.join("\n\n"),
		},
	};
	process.stdout.write(`${JSON.stringify(output)}\n`);
}

await main();
