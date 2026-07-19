#!/usr/bin/env node

import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigFiles = [".mcp.json", "mcp_config.json"];
const bundledRuntimeNames = new Set(["ast-grep-mcp", "git-bash-mcp", "lsp-tools-mcp"]);

try {
	const options = parseArgs(process.argv.slice(2));
	const report = await buildReport(options.configFiles);

	if (options.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		printTextReport(report);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

export async function buildReport(configFiles = defaultConfigFiles) {
	const configs = await Promise.all(configFiles.map(readMcpConfig));
	const servers = new Map();

	for (const config of configs) {
		for (const [name, definition] of Object.entries(config.mcpServers)) {
			const current = servers.get(name) ?? analyzeServer(name, definition);
			current.config_sources.push(config.path);
			servers.set(name, current);
		}
	}

	const entries = [...servers.values()].sort((left, right) => left.name.localeCompare(right.name));
	const remoteServers = entries.filter((server) => server.trust_class === "remote-third-party").map((server) => server.name);
	return {
		configs: configs.map(({ path, server_count }) => ({ path, server_count })),
		servers: entries,
		risks: {
			offline_remote_count: remoteServers.length,
			offline_remote_servers: remoteServers,
			no_remote_mode: remoteServers.length === 0,
		},
	};
}

function parseArgs(args) {
	const options = { json: false, configFiles: [...defaultConfigFiles] };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json") {
			options.json = true;
		} else if (arg === "--config") {
			const value = args[index + 1];
			if (!value) throw new Error("--config requires a path");
			options.configFiles = [value];
			index += 1;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return options;
}

async function readMcpConfig(path) {
	const fullPath = resolve(root, path);
	let parsed;
	try {
		parsed = JSON.parse(await readFile(fullPath, "utf8"));
	} catch (error) {
		throw new Error(`Failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (typeof parsed !== "object" || parsed === null || typeof parsed.mcpServers !== "object" || parsed.mcpServers === null) {
		throw new TypeError(`${path} must contain an mcpServers object`);
	}
	return {
		path,
		server_count: Object.keys(parsed.mcpServers).length,
		mcpServers: parsed.mcpServers,
	};
}

function analyzeServer(name, definition) {
	if (typeof definition !== "object" || definition === null) {
		return baseServer(name, "invalid", "invalid", "invalid-definition");
	}

	if (typeof definition.url === "string") {
		return {
			...baseServer(name, "remote-third-party", "url", "remote"),
			url: definition.url,
			offline_risk: true,
		};
	}

	if (typeof definition.command === "string") {
		const target = resolveCommandTarget(definition);
		return {
			...baseServer(name, target.trust_class, definition.command, target.exists ? "ok" : "missing-target"),
			args: Array.isArray(definition.args) ? definition.args : [],
			cwd: typeof definition.cwd === "string" ? definition.cwd : ".",
			target_path: target.path,
			configured_target_path: target.configuredPath,
			target_exists: target.exists,
			configured_target_exists: target.configuredExists,
			...(target.fallbackPath
				? {
						fallback_target_path: target.fallbackPath,
						fallback_target_exists: target.fallbackExists,
					}
				: {}),
		};
	}

	return baseServer(name, "unknown", "unknown", "unknown");
}

function baseServer(name, trust_class, command_or_type, status) {
	return {
		name,
		trust_class,
		command_or_type,
		status,
		config_sources: [],
	};
}

function resolveCommandTarget(definition) {
	const args = Array.isArray(definition.args) ? definition.args : [];
	const targetArg = args.find((arg) => typeof arg === "string" && looksLikeLocalPath(arg));
	if (!targetArg) {
		return {
			path: "",
			configuredPath: "",
			exists: false,
			configuredExists: false,
			trust_class: "local_unknown",
		};
	}

	const cwd = typeof definition.cwd === "string" ? definition.cwd : ".";
	const configuredPath = resolve(root, cwd, targetArg);
	const configuredExists = existsSyncish(configuredPath);
	if (configuredExists) {
		return {
			path: toRelative(configuredPath),
			configuredPath: toRelative(configuredPath),
			exists: true,
			configuredExists: true,
			trust_class: isBundledComponentPath(configuredPath) ? "local_bundled" : "local_symlink_vendor",
		};
	}

	const fallbackPath = resolveRuntimeFallback(targetArg);
	const fallbackExists = fallbackPath ? existsSyncish(fallbackPath) : false;
	return {
		path: toRelative(configuredPath),
		configuredPath: toRelative(configuredPath),
		exists: false,
		configuredExists: false,
		fallbackPath: fallbackPath ? toRelative(fallbackPath) : "",
		fallbackExists,
		trust_class: "local_missing",
	};
}

function looksLikeLocalPath(value) {
	return value.startsWith(".") || value.startsWith("/") || value.includes("/");
}

function isBundledComponentPath(path) {
	const normalized = normalize(relative(root, path));
	return normalized.startsWith(normalize("components/"));
}

function resolveRuntimeFallback(targetArg) {
	const parts = normalize(targetArg).split(/[\\/]/);
	const runtimeName = parts.find((part) => bundledRuntimeNames.has(part));
	if (!runtimeName) return null;
	const runtimeIndex = parts.indexOf(runtimeName);
	const suffix = parts.slice(runtimeIndex + 1);
	return join(root, runtimeName, ...suffix);
}

function existsSyncish(path) {
	try {
		statSync(path);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
		throw error;
	}
}

function toRelative(path) {
	const rel = relative(root, path);
	if (!rel || rel.startsWith("..") || isAbsolute(rel)) return path;
	return rel;
}

function printTextReport(report) {
	for (const server of report.servers) {
		const target = server.target_path ? ` target=${server.target_path}` : "";
		console.log(`${server.name}: ${server.status} ${server.trust_class}${target}`);
	}
}
