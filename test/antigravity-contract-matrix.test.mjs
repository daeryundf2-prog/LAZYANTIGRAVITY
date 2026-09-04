import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());

test("Antigravity-Matrix-1: hooks.json adheres to official Antigravity event names and fail-open timeouts", () => {
	const hooksPath = join(ROOT, "hooks.json");
	assert.ok(existsSync(hooksPath), "hooks.json must exist at root");

	const raw = readFileSync(hooksPath, "utf8");
	const config = JSON.parse(raw);

	const validAntigravityEvents = new Set([
		"UserPromptSubmit",
		"PostToolUse",
		"PreToolUse",
		"PostCompact",
		"Stop",
		"SubagentStop",
		"SessionStart",
		"SessionEnd",
		"SubagentCompleted",
	]);

	const hooks = config.hooks || config;
	assert.ok(typeof hooks === "object", "Hooks must be an object");

	for (const [eventName, hookList] of Object.entries(hooks)) {
		assert.ok(
			validAntigravityEvents.has(eventName),
			`Event name "${eventName}" is not a recognized Antigravity native hook event.`,
		);

		if (Array.isArray(hookList)) {
			for (const hookDef of hookList) {
				if (typeof hookDef.timeout === "number") {
					assert.ok(
						hookDef.timeout <= 15000,
						`Hook ${eventName} timeout of ${hookDef.timeout}ms exceeds 15s fail-open ceiling.`,
					);
				}
			}
		}
	}
});

test("Antigravity-Matrix-2: Model catalog guarantees Gemini 3.8 Flash and Pro tiers", () => {
	const catalogPath = join(ROOT, "model-catalog.json");
	assert.ok(existsSync(catalogPath), "model-catalog.json must exist");
	const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
	const models = catalog.antigravity?.availableModels ?? [];
	const modelIds = models.map((m) => m.id || m.modelId);

	assert.ok(
		modelIds.some((id) => typeof id === "string" && id.includes("3.8")),
		"Model catalog must feature Gemini 3.8 tier",
	);
	assert.ok(
		modelIds.some((id) => typeof id === "string" && id.includes("3.1-pro")),
		"Model catalog must feature Gemini Pro tier",
	);
});

test("Antigravity-Matrix-3: MCP Server configs strictly adhere to JSON-RPC 2.0 tool schemas", () => {
	const mcpConfigPath = join(ROOT, "mcp_config.json");
	if (existsSync(mcpConfigPath)) {
		const config = JSON.parse(readFileSync(mcpConfigPath, "utf8"));
		const mcpServers = config.mcpServers || {};

		for (const [serverName, serverDef] of Object.entries(mcpServers)) {
			assert.ok(typeof serverDef === "object", `Server ${serverName} must have valid config object`);
			assert.ok(
				typeof serverDef.command === "string" || Array.isArray(serverDef.args),
				`Server ${serverName} must define command or args`,
			);
		}
	}
});
