import { readFileSync } from "node:fs";

// Runtime-aware product identity: detect platform from environment
const _isAntigravity = !!(
	process.env["GEMINI_HOME"]?.trim() ||
	process.env["ANTIGRAVITY_HOME"]?.trim() ||
	process.env["PLUGIN_ROOT"]?.includes(".gemini")
);

export const PRODUCT_NAME = _isAntigravity ? "lazyantigravity" : "omo-codex";
export const PACKAGE_NAME = _isAntigravity ? "lazyantigravity" : "@oh-my-opencode/omo-codex";
export const CACHE_DIR_NAME = _isAntigravity ? "lazyantigravity" : "omo-codex";
export const EVENT_NAME = _isAntigravity ? "lazyantigravity_daily_active" : "omo_codex_daily_active";
export const MACHINE_ID_PREFIX = _isAntigravity ? "lazyantigravity:" : "omo-codex:";
export const LEGACY_PARENT_PACKAGE = "oh-my-opencode";
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
export const DEFAULT_POSTHOG_API_KEY = "";

type ComponentPackageManifest = { readonly version?: string };

function isComponentPackageManifest(value: unknown): value is ComponentPackageManifest {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readComponentVersionFromManifest(): string {
	try {
		const manifestUrl = new URL("../package.json", import.meta.url);
		const manifestText = readFileSync(manifestUrl, "utf-8");
		const parsed: unknown = JSON.parse(manifestText);
		if (isComponentPackageManifest(parsed) && typeof parsed.version === "string") {
			return parsed.version;
		}
	} catch {
		return "0.0.0";
	}
	return "0.0.0";
}

const COMPONENT_VERSION_CACHE = readComponentVersionFromManifest();

export function getComponentVersion(): string {
	return COMPONENT_VERSION_CACHE;
}
