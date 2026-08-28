import { readFileSync } from "node:fs";

// Single product identity. (Earlier releases switched identity at runtime
// between "lazyantigravity" and the inherited "omo-codex" package; that
// dual-identity fallback has been removed.)
export const PRODUCT_NAME = "lazyantigravity";
export const PACKAGE_NAME = "lazyantigravity";
export const CACHE_DIR_NAME = "lazyantigravity";
export const EVENT_NAME = "lazyantigravity_daily_active";
export const MACHINE_ID_PREFIX = "lazyantigravity:";
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
