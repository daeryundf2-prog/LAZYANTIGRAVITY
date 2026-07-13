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

export const MODEL_ROUTING_CAPABILITY = Object.freeze({
	canAutoRoute: false,
	selectionMode: "user-managed",
	inheritanceGuaranteed: false,
});

/**
 * @param {Record<string, string | undefined>} env
 * @returns {"codex" | "antigravity"}
 */
export function detectRuntime(env = process.env) {
	if (env.OMO_FORCE_RUNTIME === "codex" || env.LAZYCODEX_FORCE_RUNTIME === "codex" || process.env.OMO_FORCE_RUNTIME === "codex" || process.env.LAZYCODEX_FORCE_RUNTIME === "codex") return "codex";
	if (env.OMO_FORCE_RUNTIME === "antigravity" || env.LAZYCODEX_FORCE_RUNTIME === "antigravity" || process.env.OMO_FORCE_RUNTIME === "antigravity" || process.env.LAZYCODEX_FORCE_RUNTIME === "antigravity") return "antigravity";

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
	try {
		const rootPkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
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
 *   modelRouting: typeof MODEL_ROUTING_CAPABILITY,
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
			homePath: env.GEMINI_HOME?.trim() || join(process.env.HOME || process.env.USERPROFILE || "", ".gemini"),
			configFormat: "json",
			sessionEnvKeys: [
				"OMO_ULW_LOOP_SESSION_ID",
				"ANTIGRAVITY_SESSION_ID",
				"GEMINI_SESSION_ID",
				"CODEX_SESSION_ID",
				"CODEX_THREAD_ID",
			],
			modelRouting: MODEL_ROUTING_CAPABILITY,
			autoUpdateEnabled: false,
			configMigrationEnabled: false,
		};
	}

	return {
		runtime: "codex",
		productName: "LazyCodex",
		homePath: env.CODEX_HOME?.trim() || join(process.env.HOME || process.env.USERPROFILE || "", ".codex"),
		configFormat: "toml",
		sessionEnvKeys: [
			"OMO_ULW_LOOP_SESSION_ID",
			"CODEX_SESSION_ID",
			"CODEX_THREAD_ID",
		],
		modelRouting: MODEL_ROUTING_CAPABILITY,
		autoUpdateEnabled: false,
		configMigrationEnabled: false,
	};
}

