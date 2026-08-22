#!/usr/bin/env node
import { createHash } from "node:crypto";

const EVENT_ALIASES = new Map([
	["sessionstart", "session_start"], ["session_start", "session_start"],
	["userpromptsubmit", "prompt_submit"], ["prompt_submit", "prompt_submit"],
	["pretooluse", "pre_tool"], ["pre_tool", "pre_tool"],
	["posttooluse", "post_tool"], ["post_tool", "post_tool"], ["stop", "stop"],
]);

function firstString(value, keys, fallback = "unknown") {
	const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
	for (const key of keys) if (typeof object[key] === "string" && object[key].trim()) return object[key].trim();
	return fallback;
}

function normalizeEvent(value) {
	return EVENT_ALIASES.get(String(value ?? "").replace(/[\s-]/g, "_").toLowerCase()) ?? "unknown";
}

export function normalizeAntigravityPayload(payload, rawPayload = JSON.stringify(payload)) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Antigravity payload must be an object");
	const input = payload;
	const model = input.model && typeof input.model === "object" ? input.model : {};
	const rawTool = input.tool ?? input.toolCall ?? input.tool_call;
	const tool = rawTool && typeof rawTool === "object" && !Array.isArray(rawTool) ? rawTool : undefined;
	const envelope = {
		schemaVersion: 1,
		requestId: firstString(input, ["requestId", "request_id", "id"]),
		sessionId: firstString(input, ["sessionId", "session_id"]),
		workspaceRoot: firstString(input, ["workspaceRoot", "workspace_root", "cwd"]),
		event: normalizeEvent(input.event ?? input.eventName ?? input.event_type ?? input.hookEventName),
		model: {
			provider: firstString(model, ["provider", "modelProvider"], firstString(input, ["provider"])),
			modelId: firstString(model, ["modelId", "model_id", "name"], firstString(input, ["modelId", "model_id", "model"])),
			capabilities: Array.isArray(input.capabilities) ? input.capabilities.filter((item) => typeof item === "string") : [],
		},
		rawPayloadHash: createHash("sha256").update(rawPayload, "utf8").digest("hex"),
	};
	if (tool) envelope.tool = {
		name: firstString(tool, ["name", "toolName", "tool_name"]),
		args: tool.args ?? tool.arguments ?? tool.input ?? null,
		...(typeof tool.result !== "undefined" ? { result: tool.result } : {}),
		...(typeof tool.exitCode === "number" ? { exitCode: tool.exitCode } : typeof tool.exit_code === "number" ? { exitCode: tool.exit_code } : {}),
	};
	return envelope;
}

async function main() {
	let raw = "";
	for await (const chunk of process.stdin) raw += chunk;
	try { process.stdout.write(`${JSON.stringify(normalizeAntigravityPayload(JSON.parse(raw), raw))}\n`); }
	catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname) await main();
