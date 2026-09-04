import { join, normalize } from "node:path";

import { pathExists, stripDotSlash } from "./common.mjs";

export async function mcpServerEntry(root, context, configPath, name, server) {
	if (typeof server !== "object" || server === null || Array.isArray(server)) {
		context.fail("mcp", "invalid_mcp_server", `${configPath}:${name} must be an object`);
		return { name, status: "fail", trust_class: "invalid", command_or_type: null };
	}
	if (typeof server.url === "string") {
		return { name, status: "warn", trust_class: "remote/third-party", command_or_type: "url", url: server.url, target_exists: null };
	}
	if (typeof server.command !== "string") {
		context.fail("mcp", "invalid_mcp_server", `${configPath}:${name} must define command or url`);
		return { name, status: "fail", trust_class: "invalid", command_or_type: null };
	}
	if (server.command === "npx") {
		context.warn("mcp", "remote_npx_mcp", `${configPath}:${name} uses npx and is not a bundled local server`);
		return {
			name,
			status: "warn",
			trust_class: "remote-npx",
			command_or_type: "npx",
			args: Array.isArray(server.args) ? server.args : [],
			cwd: server.cwd ?? ".",
			target: null,
			target_exists: null,
		};
	}

	const target = localMcpTarget(server);
	const targetExists = target === null ? null : await pathExists(root, target);
	if (target !== null && targetExists === false) {
		context.warn("mcp", "missing_mcp_target", `${configPath}:${name} target ${target} is not present`);
	}
	return {
		name,
		status: targetExists === false ? "warn" : "pass",
		trust_class: "local-bundled",
		command_or_type: server.command,
		args: Array.isArray(server.args) ? server.args : [],
		cwd: server.cwd ?? ".",
		target,
		target_exists: targetExists,
	};
}

function localMcpTarget(server) {
	if (!Array.isArray(server.args)) return null;
	const firstPathArg = server.args.find((arg) => typeof arg === "string" && !arg.startsWith("-") && /\.m?js$/.test(arg));
	if (firstPathArg === undefined) return null;
	return stripDotSlash(normalize(join(stripDotSlash(server.cwd ?? "."), firstPathArg)));
}
