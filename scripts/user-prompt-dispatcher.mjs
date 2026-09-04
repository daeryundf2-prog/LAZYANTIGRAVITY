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
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN_ROOT = process.env["PLUGIN_ROOT"]
	? resolve(process.env["PLUGIN_ROOT"])
	: dirname(dirname(fileURLToPath(import.meta.url)));

const importComponent = (subpath) => import(pathToFileURL(join(PLUGIN_ROOT, subpath)).href);

const { runUserPromptSubmitHook: runRulesHook } = await importComponent(
	join("components", "rules", "dist", "codex-hook.js")
);
const { runQuickLaneHook } = await importComponent(
	join("components", "quick-lane", "dist", "codex-hook.js")
);
const { handleUserPromptSubmitHook } = await importComponent(
	join("components", "adaptive-reasoning", "dist", "codex-hook.js")
);
const ultrawork = await importComponent(
	join("components", "ultrawork", "dist", "codex-hook.js")
);
const { applyUserPromptUlwLoopSteering } = await importComponent(
	join("components", "ulw-loop", "dist", "codex-hook.js")
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

	const promptText = payload.prompt || "";

	// Feature 03: Dynamic Search Grounding Adaptive Threshold Controller
	const FACTUAL_TRIGGER_RE = /(?:version|release|benchmark|cve|최신|버전|성능|릴리즈|공식문서|스펙|spec|api|doc|시세|통계|법령|판례|조문)/i;
	if (FACTUAL_TRIGGER_RE.test(promptText)) {
		contributions.push(`<dynamic-search-grounding>
# Dynamic Search Grounding Active (Adaptive Threshold = 0.3)
- Mode: MODE_DYNAMIC
- Dynamic Threshold: 0.3 (Aggressive Grounding)
- Grounding Instruction: This prompt touches high-stakes factual or version/API information. Do not rely on ungrounded recall. Trigger search or fetch primary sources when verifying version names, library APIs, dates, or specifications.
</dynamic-search-grounding>`);
	}

	// Section 4.2: Local High-Fidelity Grounding Mode (Strict Non-Parametric, no Vertex API)
	const HIGH_FIDELITY_TRIGGER_RE = /(?:--high-fidelity|high-fidelity|high_fidelity|엄격한\s*그라운딩|비파라메트릭|non-parametric|하이\s*피델리티|strict[\s_-]*grounding)/i;
	if (HIGH_FIDELITY_TRIGGER_RE.test(promptText)) {
		contributions.push(`<high-fidelity-grounding>
# Local High-Fidelity Grounding Mode Active (Section 4.2)
- Mode: HIGH_FIDELITY (Strict Non-Parametric, local evidence-overlap gate; no Vertex API call)
- Grounding Gate: Zero Parametric Memory Tolerance. Answer ONLY using explicitly retrieved source chunks or verified evidence. Do not guess or extrapolate.
- Abstention Policy: If grounding coverage < 70% or supporting quotes cannot be located, strictly output '[INSUFFICIENT_DATA]: Insufficient grounded facts from primary sources' rather than confabulating.
- Verbatim Verification: Every factual claim must be backed by a verifiable source URI and matching text segment.
</high-fidelity-grounding>`);
	}

	// Feature 12: Sandwich Prompting & Document Chunk Tagging (Anti-Lost-in-the-Middle)
	if (promptText.length > 1200 || (promptText.includes("\n") && promptText.length > 600)) {
		contributions.push(`<sandwich-prompt-guard>
# Sandwich Prompting & Document Chunk Tagging (Anti-Lost-in-the-Middle)
- Document Chunking: When analyzing long contexts, tag chunks with [DOC_ID: <id> | SEC: <section>] to preserve position indices.
- Bipolar Attention Discipline: Pay equal attention to constraints in the beginning and end of long documents; never let middle-context facts fade.
- Verbatim Quote Binding: All extracted facts and metrics must map directly to verbatim source spans (<= 20 words).
</sandwich-prompt-guard>`);
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
