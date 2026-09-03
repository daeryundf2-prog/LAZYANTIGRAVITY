#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultConfigFiles = [".mcp.json", "mcp_config.json"];
const bundledRuntimeNames = new Set(["ast-grep-mcp", "git-bash-mcp", "lsp-tools-mcp", "workspace-mcp", "media-mcp", "research-mcp", "korean-law-mcp"]);

try {
	const options = parseArgs(process.argv.slice(2));
	const report = await buildReport(options.configFiles, options.probe);

	if (options.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		printTextReport(report);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

export async function buildReport(configFiles = defaultConfigFiles, probe = false) {
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
	if (probe) {
		for (const server of entries) {
			server.probe = probeServer(server);
		}
	}
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
	const options = { json: false, probe: false, configFiles: [...defaultConfigFiles] };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json") {
			options.json = true;
		} else if (arg === "--probe") {
			options.probe = true;
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
		const isSystemCommand = ["node", "npx", "uv", "python", "git"].includes(definition.command);
		return {
			path: definition.command,
			configuredPath: definition.command,
			exists: isSystemCommand,
			configuredExists: isSystemCommand,
			trust_class: isSystemCommand ? "local_system_binary" : "local_unknown",
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
	if (value.startsWith("@")) return false;
	return value.startsWith(".") || value.startsWith("/") || value.includes("/");
}

function isBundledComponentPath(path) {
	const normalized = normalize(relative(root, path));
	if (normalized.startsWith(normalize("components/"))) return true;
	const topSegment = normalized.split(/[\\/]/)[0];
	return bundledRuntimeNames.has(topSegment);
}

// Spawns a local stdio server and performs an initialize + tools/list handshake.
// Opt-in via --probe: launching servers has side effects and is never automatic.
function probeServer(server) {
	if (server.trust_class === "remote-third-party" || server.trust_class === "local_system_binary" || server.status !== "ok" || !server.target_path) {
		return { skipped: true, reason: server.trust_class === "local_system_binary" ? "system binary preset requires runtime execution" : "not a local server with an existing target" };
	}
	const target = resolve(root, server.target_path);
	const restArgs = (server.args || []).filter((arg) => !looksLikeLocalPath(arg));
	const cwd = resolve(root, typeof server.cwd === "string" ? server.cwd : ".");
	const startedAt = Date.now();
	let res;
	try {
		res = spawnSync(server.command_or_type, [target, ...restArgs], {
			input: [
				JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
				JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
				"",
			].join("\n"),
			encoding: "utf8",
			timeout: 15000,
			cwd,
		});
	} catch (error) {
		return { ok: false, latencyMs: Date.now() - startedAt, error: String(error) };
	}
	const latencyMs = Date.now() - startedAt;
	const lines = (res.stdout || "").split("\n").filter((line) => line.trim().length > 0);
	let initialize;
	let toolsList;
	for (const line of lines) {
		try {
			const msg = JSON.parse(line);
			if (msg.id === 1) initialize = msg.result;
			if (msg.id === 2) toolsList = msg.result;
		} catch {}
	}
	if (!initialize || !toolsList) {
		return {
			ok: false,
			latencyMs,
			error: `no ${!initialize ? "initialize" : "tools/list"} response (exit ${res.status ?? "?"})`,
		};
	}
	return {
		ok: true,
		latencyMs,
		protocolVersion: initialize.protocolVersion,
		serverName: initialize.serverInfo?.name,
		tools: Array.isArray(toolsList.tools) ? toolsList.tools.map((tool) => tool.name) : [],
	};
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
	if (!rel || rel.startsWith("..") || isAbsolute(rel)) return path.replaceAll("\\", "/");
	return rel.replaceAll("\\", "/");
}

function printTextReport(report) {
	for (const server of report.servers) {
		const target = server.target_path ? ` target=${server.target_path}` : "";
		let probeText = "";
		if (server.probe && !server.probe.skipped) {
			probeText = server.probe.ok
				? ` probe=ok(${server.probe.latencyMs}ms, ${server.probe.tools.length} tools)`
				: ` probe=FAILED(${server.probe.error})`;
		}
		console.log(`${server.name}: ${server.status} ${server.trust_class}${target}${probeText}`);
	}
}
