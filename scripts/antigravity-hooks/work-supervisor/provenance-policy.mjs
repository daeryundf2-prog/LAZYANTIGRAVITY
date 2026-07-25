import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "./audit-ledger.mjs";

const CONFIG_FILE = "provenance-config.json";

const HARD_EXCLUDES = new Set([
	".git", ".hg", ".svn", ".codegraph",
]);

const SOFT_EXCLUDES = new Set([
	"node_modules", ".venv", "venv", "__pycache__", ".pytest_cache",
	".next/cache", ".turbo", ".parcel-cache", "dist", "build",
	".cache", ".mypy_cache", ".ruff_cache", "coverage", ".nyc_output",
	"target", ".gradle", ".idea", ".vscode",
]);

const DEFAULT_CONFIG = {
	version: 1,
	include: [],
	exclude: [...SOFT_EXCLUDES],
	generated: [],
};

export function loadProvenanceConfig(workspaceRoot) {
	const path = join(stateDir(workspaceRoot), CONFIG_FILE);
	if (!existsSync(path)) return { ...DEFAULT_CONFIG };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
			return { ...DEFAULT_CONFIG };
		}
		return {
			version: 1,
			include: Array.isArray(parsed.include) ? parsed.include : [],
			exclude: Array.isArray(parsed.exclude) ? [...new Set([...SOFT_EXCLUDES, ...parsed.exclude])] : [...SOFT_EXCLUDES],
			generated: Array.isArray(parsed.generated) ? parsed.generated : [],
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function isHardExcluded(path) {
	const parts = path.replace(/\\/g, "/").split("/");
	return parts.some((p) => HARD_EXCLUDES.has(p));
}

export function isSoftExcluded(path, config) {
	const parts = path.replace(/\\/g, "/").split("/");
	const excludeSet = new Set(config.exclude || SOFT_EXCLUDES);
	const includeSet = new Set(config.include || []);
	const generatedSet = new Set(config.generated || []);

	for (const part of parts) {
		if (excludeSet.has(part) && !includeSet.has(part)) {
			if (!generatedSet.has(part)) return true;
		}
	}
	return false;
}

export function shouldDescend(path, config) {
	if (isHardExcluded(path)) return false;
	if (isSoftExcluded(path, config)) return false;
	return true;
}

export function canonicalizeProjectPath(workspaceRoot, target) {
	if (!target || typeof target !== "string") return null;
	const normalized = target.trim().replace(/\\/g, "/");
	if (!normalized) return null;
	if (normalized.startsWith("..") || isAbsolute(normalized)) {
		const absolute = isAbsolute(normalized) ? normalized : join(workspaceRoot, normalized);
		const rel = relative(workspaceRoot, absolute);
		if (rel === "." || rel === "" || rel.startsWith("..")) return null;
		return rel.replace(/\\/g, "/");
	}
	return normalized;
}

export function isPathInScope(path, config) {
	if (isHardExcluded(path)) return false;
	const includePatterns = config.include || [];
	if (includePatterns.length === 0) return true;
	return includePatterns.some((pattern) => path === pattern || path.startsWith(pattern + "/"));
}

export function isUserHomeRoot(workspaceRoot) {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	return workspaceRoot === home;
}

function isAbsolute(p) {
	return p.startsWith("/") || (p.length >= 2 && p[1] === ":") || p.startsWith("\\\\");
}

function relative(from, to) {
	const fromParts = from.replace(/\\/g, "/").split("/").filter(Boolean);
	const toParts = to.replace(/\\/g, "/").split("/").filter(Boolean);
	let i = 0;
	while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
	const up = fromParts.slice(i).map(() => "..");
	const down = toParts.slice(i);
	const result = [...up, ...down].join("/");
	return result || ".";
}
