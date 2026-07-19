#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	DEFAULT_LOCK_STALE_MS,
	acquireLock,
	appendUpdateLog,
	readState,
	resolveLockPath,
	resolveLogPath,
	resolveStatePath,
	writeState,
} from "./auto-update-state.mjs";
import { migrateCodexConfig } from "./migrate-codex-config.mjs";
import { getRuntimeConfig } from "./runtime-adapter.mjs";
import { resolveSpawnInvocation } from "./spawn-command.mjs";

const PRODUCT_NAME = "LazyAntigravity";
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RETRY_INTERVAL_MS = 30 * 60 * 1_000;
const DEFAULT_UPDATE_COMMAND = "npx";
const INSTALLED_VERSION_FILE = "lazycodex-install.json";

export function resolveAutoUpdatePlan({ env = process.env, now = Date.now(), lastCheckedAt, lastAttemptedAt, lastStatus } = {}) {
	if (readEnv(env, ["ANTIGRAVITY_AUTO_UPDATE_DISABLED", "LAZYCODEX_AUTO_UPDATE_DISABLED", "OMO_CODEX_AUTO_UPDATE_DISABLED"]) === "1") {
		return statusPlan("disabled");
	}

	const intervalMs = parsePositiveInteger(readEnv(env, ["ANTIGRAVITY_AUTO_UPDATE_INTERVAL_MS", "LAZYCODEX_AUTO_UPDATE_INTERVAL_MS"]), DEFAULT_INTERVAL_MS);
	const successStatus = lastStatus === undefined || lastStatus === "success";
	if (successStatus && typeof lastCheckedAt === "number" && intervalMs > 0 && now - lastCheckedAt < intervalMs) {
		return statusPlan("throttled");
	}
	const retryIntervalMs = parsePositiveInteger(readEnv(env, ["ANTIGRAVITY_AUTO_UPDATE_RETRY_INTERVAL_MS", "LAZYCODEX_AUTO_UPDATE_RETRY_INTERVAL_MS"]), DEFAULT_RETRY_INTERVAL_MS);
	if (!successStatus && typeof lastAttemptedAt === "number" && retryIntervalMs > 0 && now - lastAttemptedAt < retryIntervalMs) {
		return statusPlan("retry-throttled");
	}

	const source = resolveUpdateSource(env);
	if (!source.configured) return statusPlan("missing-update-source");

	const updatePlan = resolveAntigravityUpdatePlan({
		currentVersion: resolveCurrentVersion(env),
		latestVersion: resolveLatestVersion(env),
		command: source.command,
		args: source.args,
		legacyCompatibility: source.legacyCompatibility,
	});
	if (!updatePlan.shouldUpdate) return statusPlan(updatePlan.reason, source);

	return {
		shouldRun: true,
		product: PRODUCT_NAME,
		mode: "update",
		mutating: true,
		command: updatePlan.command,
		args: updatePlan.args,
		legacyCompatibility: updatePlan.legacyCompatibility,
		env: {
			...env,
			ANTIGRAVITY_AUTO_UPDATE_DISABLED: "1",
			LAZYCODEX_AUTO_UPDATE_DISABLED: "1",
			OMO_CODEX_AUTO_UPDATE_DISABLED: "1",
		},
	};
}

export function resolveAntigravityUpdatePlan({ currentVersion, latestVersion, command = DEFAULT_UPDATE_COMMAND, args, legacyCompatibility = false } = {}) {
	if (!Array.isArray(args) || args.length === 0) return statusPlan("missing-update-source", { legacyCompatibility });
	const current = parseVersion(currentVersion);
	if (current === null) return statusPlan("unknown-current", { legacyCompatibility });
	const latest = parseVersion(latestVersion);
	if (latest === null) return statusPlan("unknown-latest", { legacyCompatibility });
	if (compareVersions(latest, current) <= 0) return statusPlan("up-to-date", { legacyCompatibility });
	return { shouldUpdate: true, command, args, legacyCompatibility };
}

export function resolveLazyCodexUpdatePlan(options = {}) {
	return resolveAntigravityUpdatePlan(options);
}

export async function runLazyCodexManualUpdate({ env = process.env, dryRun = false, log = console.log, runCommand } = {}) {
	const commandRunner = runCommand ?? defaultRunCommandForManualUpdate;
	const source = resolveUpdateSource(env);
	const currentVersion = resolveCurrentVersion(env);
	const latestVersion = resolveLatestVersion(env);
	const plan = resolveAntigravityUpdatePlan({
		currentVersion,
		latestVersion,
		command: source.command,
		args: source.args,
		legacyCompatibility: source.legacyCompatibility,
	});
	if (!plan.shouldUpdate) {
		const printableVersion = currentVersion ?? "unknown";
		log(plan.reason === "up-to-date"
			? `${PRODUCT_NAME} ${printableVersion} is already up to date.`
			: `Unable to check ${PRODUCT_NAME} updates (${plan.reason}).`);
		return plan.reason === "up-to-date" ? 0 : 1;
	}
	if (dryRun) {
		log(`${plan.command} ${plan.args.join(" ")}`);
		return 0;
	}
	await commandRunner(plan.command, plan.args, { cwd: process.cwd(), env });
	return 0;
}

export async function runAutoUpdateCheck({ env = process.env, now = Date.now() } = {}) {
	const runtimeConfig = getRuntimeConfig(env);
	if (runtimeConfig.configMigrationEnabled) await runConfigMigration({ env });
	const statePath = resolveStatePath(env);
	const state = await readState(statePath);
	const plan = resolveAutoUpdatePlan({
		env,
		now,
		lastCheckedAt: state.lastCheckedAt,
		lastAttemptedAt: state.lastAttemptedAt,
		lastStatus: state.lastStatus,
	});
	if (!plan.shouldRun) {
		await appendUpdateLog(env, now, "skipped", { reason: plan.reason });
		return { started: false, reason: plan.reason };
	}

	const lockStaleMs = parsePositiveInteger(readEnv(env, ["ANTIGRAVITY_AUTO_UPDATE_LOCK_STALE_MS", "LAZYCODEX_AUTO_UPDATE_LOCK_STALE_MS"]), DEFAULT_LOCK_STALE_MS);
	const lock = await acquireLock(resolveLockPath(env, statePath), now, lockStaleMs);
	if (lock === null) {
		await appendUpdateLog(env, now, "locked");
		return { started: false, reason: "locked" };
	}
	try {
		await appendUpdateLog(env, now, "started", { command: plan.command, args: plan.args });
		if (readEnv(env, ["ANTIGRAVITY_AUTO_UPDATE_WAIT", "LAZYCODEX_AUTO_UPDATE_WAIT"]) === "1") {
			const invocation = resolveSpawnInvocation(plan.command, plan.args);
			const result = spawnSync(invocation.command, invocation.args, {
				env: plan.env,
				stdio: "ignore",
			});
			const status = result.status ?? (result.error === undefined ? 0 : 1);
			await appendUpdateLog(env, now, "finished", { status });
			await writeState(statePath, status === 0
				? { lastCheckedAt: now, lastAttemptedAt: now, lastStatus: "success" }
				: { lastAttemptedAt: now, lastStatus: "failed" });
			return { started: true, status };
		}

		const invocation = resolveSpawnInvocation(plan.command, plan.args);
		const child = spawn(invocation.command, invocation.args, {
			env: plan.env,
			stdio: "ignore",
			detached: true,
		});
		await writeState(statePath, { lastAttemptedAt: now, lastStatus: "started" });
		child.unref();
		return { started: true };
	} finally {
		await lock.release();
	}
}

export function resolveAutoUpdateStatus({ env = process.env, now = Date.now() } = {}) {
	const plan = resolveAutoUpdatePlan({ env, now });
	const commandPlan = plan.shouldRun
		? {
			command: plan.command,
			args: plan.args,
			wouldRun: true,
			legacyCompatibility: plan.legacyCompatibility === true,
		}
		: null;
	const statePath = resolveStatePath(env);
	return {
		product: PRODUCT_NAME,
		mode: plan.shouldRun ? "dry-run" : "status",
		dryRun: true,
		mutating: false,
		shouldRun: false,
		reason: plan.reason ?? (plan.shouldRun ? "would-run" : "status-only"),
		commandPlan,
		state: {
			statePath,
			logPath: resolveLogPath(env),
			lockPath: resolveLockPath(env, statePath),
		},
		compatibilityAliases: {
			envPrefix: "LAZYCODEX_AUTO_UPDATE_*",
			statePrefix: "LAZYCODEX_AUTO_UPDATE_*_PATH",
			usage: "legacy compatibility aliases only; no default lazycodex-ai update source is configured",
		},
	};
}

async function runConfigMigration({ env }) {
	if (env.LAZYCODEX_CONFIG_MIGRATION_DISABLED === "1" || env.OMO_CODEX_CONFIG_MIGRATION_DISABLED === "1") return;
	try {
		await migrateCodexConfig({ env });
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		return;
	}
}

function statusPlan(reason, extra = {}) {
	return {
		shouldRun: false,
		shouldUpdate: false,
		product: PRODUCT_NAME,
		mode: "status",
		mutating: false,
		reason,
		...extra,
	};
}

function resolveUpdateSource(env) {
	if (env.ANTIGRAVITY_AUTO_UPDATE_ARGS_JSON !== undefined) {
		return {
			configured: true,
			command: readEnv(env, ["ANTIGRAVITY_AUTO_UPDATE_COMMAND"]) || DEFAULT_UPDATE_COMMAND,
			args: parseArgsJson(env.ANTIGRAVITY_AUTO_UPDATE_ARGS_JSON, "ANTIGRAVITY_AUTO_UPDATE_ARGS_JSON"),
			legacyCompatibility: false,
		};
	}
	const antigravitySource = readEnv(env, ["ANTIGRAVITY_AUTO_UPDATE_SOURCE"]);
	if (antigravitySource) {
		return {
			configured: true,
			command: readEnv(env, ["ANTIGRAVITY_AUTO_UPDATE_COMMAND"]) || DEFAULT_UPDATE_COMMAND,
			args: argsForSource(antigravitySource),
			legacyCompatibility: false,
		};
	}
	if (env.LAZYCODEX_AUTO_UPDATE_ARGS_JSON !== undefined) {
		return {
			configured: true,
			command: readEnv(env, ["LAZYCODEX_AUTO_UPDATE_COMMAND"]) || DEFAULT_UPDATE_COMMAND,
			args: parseArgsJson(env.LAZYCODEX_AUTO_UPDATE_ARGS_JSON, "LAZYCODEX_AUTO_UPDATE_ARGS_JSON"),
			legacyCompatibility: true,
		};
	}
	const legacySource = readEnv(env, ["LAZYCODEX_AUTO_UPDATE_SOURCE"]);
	if (legacySource) {
		return {
			configured: true,
			command: readEnv(env, ["LAZYCODEX_AUTO_UPDATE_COMMAND"]) || DEFAULT_UPDATE_COMMAND,
			args: argsForSource(legacySource),
			legacyCompatibility: true,
		};
	}
	return { configured: false, legacyCompatibility: false };
}

function argsForSource(source) {
	return ["--yes", source, "install", "--no-tui", "--codex-autonomous"];
}

function parseArgsJson(raw, name) {
	const parsed = JSON.parse(raw);
	if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((value) => typeof value !== "string" || value.length === 0)) {
		throw new TypeError(`${name} must be a non-empty JSON string array`);
	}
	return parsed;
}

function resolveCurrentVersion(env) {
	if (env.ANTIGRAVITY_CURRENT_VERSION?.trim()) return env.ANTIGRAVITY_CURRENT_VERSION.trim();
	if (env.LAZYCODEX_CURRENT_VERSION?.trim()) return env.LAZYCODEX_CURRENT_VERSION.trim();
	const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
	return (
		readVersionManifest(resolveInstalledVersionPath(env, pluginRoot)) ??
		readVersionManifest(join(pluginRoot, "..", "..", "..", "package.json")) ??
		readVersionManifest(join(pluginRoot, ".codex-plugin", "plugin.json"))
	);
}

function resolveLatestVersion(env) {
	if (env.ANTIGRAVITY_LATEST_VERSION?.trim()) return env.ANTIGRAVITY_LATEST_VERSION.trim();
	if (env.LAZYCODEX_LATEST_VERSION?.trim()) return env.LAZYCODEX_LATEST_VERSION.trim();
	return undefined;
}

function defaultRunCommandForManualUpdate(command, args, options) {
	return new Promise((resolve, reject) => {
		const invocation = resolveSpawnInvocation(command, args);
		const child = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			env: options.env,
			stdio: "inherit",
		});
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown status"}`));
		});
	});
}

function parseVersion(version) {
	if (typeof version !== "string") return null;
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.*)?$/.exec(version.trim());
	if (match === null) return null;
	const major = Number.parseInt(match[1], 10);
	const minor = Number.parseInt(match[2], 10);
	const patch = Number.parseInt(match[3], 10);
	const prerelease = match[4];
	return Number.isFinite(major) && Number.isFinite(minor) && Number.isFinite(patch)
		? { major, minor, patch, prerelease }
		: null;
}

function compareVersions(left, right) {
	for (const key of ["major", "minor", "patch"]) {
		const leftValue = left[key];
		const rightValue = right[key];
		if (leftValue > rightValue) return 1;
		if (leftValue < rightValue) return -1;
	}
	if (left.prerelease === undefined && right.prerelease !== undefined) return 1;
	if (left.prerelease !== undefined && right.prerelease === undefined) return -1;
	if (left.prerelease !== undefined && right.prerelease !== undefined) {
		return left.prerelease.localeCompare(right.prerelease);
	}
	return 0;
}

function resolveInstalledVersionPath(env, pluginRoot) {
	if (env.ANTIGRAVITY_INSTALLED_VERSION_PATH?.trim()) return env.ANTIGRAVITY_INSTALLED_VERSION_PATH;
	if (env.LAZYCODEX_INSTALLED_VERSION_PATH?.trim()) return env.LAZYCODEX_INSTALLED_VERSION_PATH;
	return join(pluginRoot, INSTALLED_VERSION_FILE);
}

function readVersionManifest(path) {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (typeof parsed.version !== "string") return undefined;
		const version = parsed.version.trim();
		return version.length > 0 ? version : undefined;
	} catch (error) {
		if (error instanceof Error) return undefined;
		throw error;
	}
}

function parsePositiveInteger(value, fallback) {
	if (value === undefined || value === "") return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readEnv(env, keys) {
	for (const key of keys) {
		const value = env[key]?.trim();
		if (value) return value;
	}
	return undefined;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2);
	const runRequested = args.includes("--run") || args.includes("hook") || args.includes("session-start");
	const statusRequested = args.includes("--status") || args.includes("--json") || args.length === 0;
	(runRequested
		? runAutoUpdateCheck()
		: Promise.resolve(resolveAutoUpdateStatus()).then((status) => {
			if (args.includes("--json")) {
				console.log(JSON.stringify(status, null, 2));
				return;
			}
			if (statusRequested) console.log(`${status.product}: ${status.mode} (${status.reason})`);
		})
	).catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
