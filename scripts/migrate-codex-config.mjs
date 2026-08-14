#!/usr/bin/env node

import { lstat, mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import TOML from "@iarna/toml";
import { getRuntimeConfig } from "./runtime-adapter.mjs";

const FALLBACK_CATALOG = {
	version: "fallback.gpt-5.5-400k",
	current: {
		model: "gpt-5.5",
		model_context_window: 400_000,
		model_reasoning_effort: "high",
		plan_mode_reasoning_effort: "xhigh",
	},
	roles: {
		default: {
			model: "gpt-5.5",
			model_context_window: 400_000,
			model_reasoning_effort: "high",
			plan_mode_reasoning_effort: "xhigh",
		},
		verifier: { model: "gpt-5.5", model_reasoning_effort: "xhigh" },
		worker: { model: "gpt-5.5", model_reasoning_effort: "high" },
	},
	managedProfiles: [
		{
			version: "legacy.gpt-5.5-1m",
			match: {
				model: "gpt-5.5",
				model_context_window: 1_000_000,
				model_reasoning_effort: "high",
				plan_mode_reasoning_effort: "xhigh",
			},
		},
		{ version: "legacy.gpt-5.5-272k", match: { model: "gpt-5.5", model_context_window: 272_000 } },
	],
};

const MANAGED_KEYS = ["model", "model_context_window", "model_reasoning_effort", "plan_mode_reasoning_effort"];

async function writeFileAtomically(filePath, content) {
	const tempPath = `${filePath}.${Math.random().toString(36).slice(2)}.tmp`;
	await writeFile(tempPath, content, "utf8");
	try {
		await rename(tempPath, filePath);
	} catch (error) {
		try {
			await rm(tempPath, { force: true });
		} catch {}
		throw error;
	}
}

export async function migrateCodexConfig({ env = process.env, cwd = process.cwd() } = {}) {
	const runtimeConfig = getRuntimeConfig(env);
	const optIn = env.LAZYCODEX_CONFIG_MIGRATION_OPT_IN === "1" || env.OMO_CODEX_CONFIG_MIGRATION_OPT_IN === "1";
	if (!runtimeConfig.configMigrationEnabled || !optIn) {
		return { changed: [] };
	}
	const catalog = await readModelCatalog(env);
	const statePath = resolveStatePath(env);
	const state = await readState(statePath);
	const paths = await configPaths({ env, cwd });
	const changed = [];
	const nextState = { catalogVersion: catalog.version, files: {} };
	for (const configPath of paths) {
		const result = await migrateConfigFile(configPath, {
			catalog,
			previousState: state.files?.[configPath],
		});
		if (result.changed) changed.push(configPath);
		nextState.files[configPath] = {
			catalogVersion: catalog.version,
			written: result.written,
			managed: result.managed,
		};
	}
	await writeState(statePath, nextState);
	return { changed };
}

export async function migrateConfigFile(configPath, { catalog = FALLBACK_CATALOG, previousState } = {}) {
	const before = await readConfig(configPath);
	const decision = shouldApplyCatalog(before, catalog, previousState);
	if (!decision.apply) return { changed: false, written: readRootSettings(before), managed: false };
	const after = ensureCodexReasoningConfig(before, catalog.current);
	if (after === before) return { changed: false, written: catalog.current, managed: true };
	await mkdir(dirname(configPath), { recursive: true });

	// Create backup prior to rewriting; abort on failure to prevent data loss
	if (before) {
		const allowSkipBackup = process.env.LAZYCODEX_CONFIG_MIGRATION_SKIP_BACKUP === "1" || process.env.OMO_CODEX_CONFIG_MIGRATION_SKIP_BACKUP === "1";
		try {
			await writeFile(`${configPath}.bak`, before, "utf8");
		} catch (error) {
			if (allowSkipBackup) {
				// user explicitly opted into skip-backup; proceed without backup
			} else {
				throw new Error(`Failed to create backup at ${configPath}.bak (set LAZYCODEX_CONFIG_MIGRATION_SKIP_BACKUP=1 to override): ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	// Atomic write
	await writeFileAtomically(configPath, `${after.trimEnd()}\n`);
	return { changed: true, written: catalog.current, managed: true };
}

export function ensureCodexReasoningConfig(config, profile = FALLBACK_CATALOG.current) {
	let parsed;
	try {
		parsed = TOML.parse(config);
	} catch {
		parsed = {};
	}
	parsed.model = profile.model;
	parsed.model_context_window = profile.model_context_window;
	parsed.model_reasoning_effort = profile.model_reasoning_effort;
	parsed.plan_mode_reasoning_effort = profile.plan_mode_reasoning_effort;
	return TOML.stringify(parsed);
}

export async function readModelCatalog(env = process.env) {
	const catalogPath = env.LAZYCODEX_MODEL_CATALOG_PATH?.trim() || join(dirname(fileURLToPath(import.meta.url)), "..", "model-catalog.json");
	try {
		const raw = JSON.parse(await readFile(catalogPath, "utf8"));
		// New multi-platform format: extract the "codex" section (migration is Codex-only)
		const platformSection = isRecord(raw.codex) ? { ...raw.codex, version: raw.version } : raw;
		return parseCatalog(platformSection) ?? FALLBACK_CATALOG;
	} catch (error) {
		if (error instanceof Error) return FALLBACK_CATALOG;
		throw error;
	}
}

function shouldApplyCatalog(config, catalog, previousState) {
	const current = readRootSettings(config);
	if (Object.keys(current).length === 0) return { apply: true, reason: "empty" };
	if (matchesProfile(current, catalog.current)) return { apply: false, reason: "current" };
	if (previousState?.managed === true && matchesProfile(current, previousState.written)) {
		return { apply: true, reason: "managed-state" };
	}
	for (const profile of catalog.managedProfiles) {
		if (matchesProfile(current, profile.match)) return { apply: true, reason: profile.version };
	}
	return { apply: false, reason: "user-modified" };
}

function matchesProfile(current, profile) {
	if (!isRecord(profile)) return false;
	for (const [key, value] of Object.entries(profile)) {
		if (current[key] !== value) return false;
	}
	return true;
}

function readRootSettings(config) {
	try {
		const parsed = TOML.parse(config);
		const settings = {};
		for (const key of MANAGED_KEYS) {
			if (parsed[key] !== undefined) {
				settings[key] = parsed[key];
			}
		}
		return settings;
	} catch {
		return {};
	}
}

function parseCatalog(value) {
	if (!isRecord(value) || !isRecord(value.current) || !Array.isArray(value.managedProfiles)) return null;
	if (typeof value.version !== "string" || !isReasoningProfile(value.current)) return null;
	const managedProfiles = [];
	for (const profile of value.managedProfiles) {
		if (!isRecord(profile) || typeof profile.version !== "string" || !isRecord(profile.match)) return null;
		managedProfiles.push({ version: profile.version, match: profile.match });
	}
	return { version: value.version, current: value.current, managedProfiles, roles: isRecord(value.roles) ? value.roles : {} };
}

function isReasoningProfile(value) {
	return (
		isRecord(value) &&
		typeof value.model === "string" &&
		typeof value.model_context_window === "number" &&
		typeof value.model_reasoning_effort === "string" &&
		typeof value.plan_mode_reasoning_effort === "string"
	);
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function configPaths({ env, cwd }) {
	const codexHome = resolve(env.CODEX_HOME?.trim() || join(homedir(), ".codex"));
	const paths = new Set([join(codexHome, "config.toml")]);
	for (const projectConfig of projectConfigPaths({ cwd, stopAt: homedir() })) {
		if (!(await isRegularFile(projectConfig))) continue;
		if (!(await isRegularDirectory(dirname(projectConfig)))) continue;
		paths.add(projectConfig);
	}
	return [...paths];
}

function projectConfigPaths({ cwd, stopAt }) {
	const paths = [];
	let current = resolve(cwd);
	const stop = resolve(stopAt);
	while (true) {
		paths.push(join(current, ".codex", "config.toml"));
		if (current === stop || current === dirname(current)) break;
		current = dirname(current);
	}
	return paths;
}

async function readConfig(configPath) {
	try {
		return await readFile(configPath, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
		throw error;
	}
}

function resolveStatePath(env) {
	if (env.LAZYCODEX_MODEL_CATALOG_STATE_PATH?.trim()) return env.LAZYCODEX_MODEL_CATALOG_STATE_PATH;
	const dataRoot = env.PLUGIN_DATA?.trim() || join(homedir(), ".local", "share", "lazycodex");
	return join(dataRoot, "model-catalog-state.json");
}

async function readState(statePath) {
	try {
		const parsed = JSON.parse(await readFile(statePath, "utf8"));
		return isRecord(parsed) ? parsed : {};
	} catch (error) {
		if (error instanceof Error) return {};
		throw error;
	}
}

async function writeState(statePath, state) {
	await mkdir(dirname(statePath), { recursive: true });
	await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function isRegularFile(path) {
	try {
		return (await lstat(path)).isFile();
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

async function isRegularDirectory(path) {
	try {
		return (await lstat(path)).isDirectory();
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	migrateCodexConfig().catch((error) => {
		if (!(error instanceof Error)) throw error;
		process.exit(1);
	});
}
