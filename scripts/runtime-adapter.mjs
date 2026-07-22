/**
 * Runtime Adapter — central platform detection for LazyCodex / LazyAntigravity.
 *
 * Detects whether the plugin is running inside OpenAI Codex or Google Antigravity
 * and exposes a unified configuration object that other modules can consume.
 *
 * Detection priority:
 *   1. .runtime-hint.json in PLUGIN_ROOT (written by installer)
 *   2. PLUGIN_ROOT path contains ".gemini" → antigravity
 *   3. GEMINI_HOME or ANTIGRAVITY_HOME env vars → antigravity
 *   4. Default → codex
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {Record<string, string | undefined>} env
 * @returns {"codex" | "antigravity"}
 */
export function detectRuntime(env = process.env) {
	// 1. Check installer-written hint file
	const pluginRoot = env.PLUGIN_ROOT?.trim();
	if (pluginRoot) {
		try {
			const hint = JSON.parse(readFileSync(join(pluginRoot, ".runtime-hint.json"), "utf8"));
			if (hint?.target === "antigravity") return "antigravity";
			if (hint?.target === "codex") return "codex";
		} catch {
			// No hint file — fall through to heuristics
		}

		// 2. Path-based detection
		if (pluginRoot.includes(".gemini")) return "antigravity";
	}

	// 3. Environment variable detection
	if (env.GEMINI_HOME?.trim() || env.ANTIGRAVITY_HOME?.trim()) return "antigravity";

	// 4. Check if we are building/running in the lazyantigravity repository
	try {
		const rootPkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "package.json");
		const pkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
		if (pkg.name === "lazyantigravity") return "antigravity";
	} catch {
		// ignore
	}

	// 5. Default to codex
	return "codex";
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{
 *   runtime: "codex" | "antigravity",
 *   productName: string,
 *   homePath: string,
 *   configFormat: "toml" | "json",
 *   sessionEnvKeys: readonly string[],
 *   autoUpdateEnabled: boolean,
 *   configMigrationEnabled: boolean,
 * }}
 */
export function getRuntimeConfig(env = process.env) {
	const runtime = detectRuntime(env);

	if (runtime === "antigravity") {
		return {
			runtime: "antigravity",
			productName: "LazyAntigravity",
			modelCatalogKey: "antigravity",
			homePath: env.GEMINI_HOME?.trim() || join(process.env.HOME || process.env.USERPROFILE || "", ".gemini"),
			configFormat: "json",
			sessionEnvKeys: [
				"OMO_ULW_LOOP_SESSION_ID",
				"ANTIGRAVITY_SESSION_ID",
				"GEMINI_SESSION_ID",
				"CODEX_SESSION_ID",
				"CODEX_THREAD_ID",
			],
			autoUpdateEnabled: false,
			configMigrationEnabled: false,
		};
	}

	return {
		runtime: "codex",
		productName: "LazyCodex",
		modelCatalogKey: "codex",
		homePath: env.CODEX_HOME?.trim() || join(process.env.HOME || process.env.USERPROFILE || "", ".codex"),
		configFormat: "toml",
		sessionEnvKeys: [
			"OMO_ULW_LOOP_SESSION_ID",
			"CODEX_SESSION_ID",
			"CODEX_THREAD_ID",
		],
		autoUpdateEnabled: true,
		configMigrationEnabled: true,
	};
}

/**
 * Read the model catalog and return the platform-specific section.
 * Falls back to the legacy flat format (pre-multi-platform) for backward compat.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ current: object, roles: object, managedProfiles: Array }}
 */
export function readModelCatalogForRuntime(env = process.env) {
	const config = getRuntimeConfig(env);
	const catalogPath = join(
		env.PLUGIN_ROOT?.trim() || dirname(fileURLToPath(import.meta.url)) + "/..",
		"model-catalog.json"
	);
	try {
		const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
		// New multi-platform format: { codex: {...}, antigravity: {...} }
		if (catalog[config.modelCatalogKey]) {
			return catalog[config.modelCatalogKey];
		}
		// Legacy flat format: { current: {...}, roles: {...}, managedProfiles: [...] }
		if (catalog.current) {
			return catalog;
		}
	} catch {
		// Fall through to defaults
	}
	// Sensible defaults per platform
	if (config.runtime === "antigravity") {
		return {
			current: { model: "claude-opus-4.6", model_context_window: 200000, model_reasoning_effort: "high", plan_mode_reasoning_effort: "xhigh" },
			roles: {
				default: { model: "claude-sonnet-4.6", model_reasoning_effort: "thinking" },
				planner: { model: "claude-opus-4.6", model_reasoning_effort: "thinking" },
				verifier: { model: "gemini-3.1-pro-high", model_reasoning_effort: "high" },
				worker: { model: "claude-sonnet-4.6", model_reasoning_effort: "thinking" },
				researcher: { model: "gemini-3.6-flash-high", model_reasoning_effort: "high" },
				fast: { model: "gemini-3.6-flash-medium", model_reasoning_effort: "medium" },
				fallback: { model: "gpt-oss-120b", model_reasoning_effort: "medium" },
			},
			managedProfiles: [],
		};
	}
	return {
		current: { model: "gpt-5.5", model_context_window: 400000, model_reasoning_effort: "high", plan_mode_reasoning_effort: "xhigh" },
		roles: {
			default: { model: "gpt-5.5", model_context_window: 400000, model_reasoning_effort: "high", plan_mode_reasoning_effort: "xhigh" },
			verifier: { model: "gpt-5.5", model_reasoning_effort: "xhigh" },
			worker: { model: "gpt-5.5", model_reasoning_effort: "high" },
		},
		managedProfiles: [],
	};
}

