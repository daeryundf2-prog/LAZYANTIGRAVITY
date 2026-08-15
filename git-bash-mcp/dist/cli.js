#!/usr/bin/env node
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const TOOLS = [
	{
		name: "git_bash_execute",
		description: "Execute a safe read-only or git command strictly within Git Bash environment without shell chaining.",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string", description: "Safe command to execute (e.g. 'git status', 'pwd', 'ls')" },
				cwd: { type: "string", description: "Working directory path" }
			},
			required: ["command"]
		}
	}
];

const STRICT_ALLOWED_BINARIES = new Set(["git", "pwd", "ls", "echo"]);
const SHELL_METASYMBOLS = /[;&|`$><()\\\n\r]/;

function parseSafeCommand(commandStr) {
	if (!commandStr || typeof commandStr !== "string") {
		return { ok: false, error: "Command must be a non-empty string." };
	}

	const trimmed = commandStr.trim();
	if (SHELL_METASYMBOLS.test(trimmed)) {
		return { ok: false, error: "Command chaining and shell metacharacters (; & | ` $ > < \\) are strictly prohibited." };
	}

	// Split by whitespace without shell evaluation
	const tokens = trimmed.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		return { ok: false, error: "Empty command." };
	}

	const rawBinary = tokens[0].toLowerCase();
	const binary = rawBinary.split(/[\/\\]/).pop() ?? "";

	if (!STRICT_ALLOWED_BINARIES.has(binary)) {
		return {
			ok: false,
			error: `Binary '${binary}' is not permitted. Only [${Array.from(STRICT_ALLOWED_BINARIES).join(", ")}] are allowed.`
		};
	}

	const args = tokens.slice(1);
	return { ok: true, binary, args };
}

async function handleJsonRpc(message) {
	if (!message || typeof message !== "object") return null;
	const { id, method, params } = message;

	if (method === "initialize") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "git-bash-mcp", version: "0.1.0" }
			}
		};
	}

	if (method === "notifications/initialized") {
		return null;
	}

	if (method === "tools/list") {
		return {
			jsonrpc: "2.0",
			id,
			result: { tools: TOOLS }
		};
	}

	if (method === "tools/call") {
		const name = params?.name;
		const args = params?.arguments ?? {};

		if (name !== "git_bash_execute") {
			return {
				jsonrpc: "2.0",
				id,
				error: { code: -32602, message: `Unsupported tool: ${name}` }
			};
		}

		const parsed = parseSafeCommand(args.command);
		if (!parsed.ok) {
			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({ ok: false, error: parsed.error }, null, 2)
					}],
					isError: true
				}
			};
		}

		const cwd = args.cwd ? resolve(process.cwd(), args.cwd) : process.cwd();

		try {
			const res = spawnSync(parsed.binary, parsed.args, {
				cwd,
				encoding: "utf8",
				timeout: 10000,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"]
			});

			const stdout = (res.stdout || "").trim();
			const stderr = (res.stderr || "").trim();

			if (res.error) {
				return {
					jsonrpc: "2.0",
					id,
					result: {
						content: [{
							type: "text",
							text: JSON.stringify({ ok: false, error: res.error.message }, null, 2)
						}],
						isError: true
					}
				};
			}

			if (res.status !== 0) {
				return {
					jsonrpc: "2.0",
					id,
					result: {
						content: [{
							type: "text",
							text: JSON.stringify({ ok: false, output: stderr || stdout, exitCode: res.status }, null, 2)
						}],
						isError: true
					}
				};
			}

			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({ ok: true, output: stdout }, null, 2)
					}]
				}
			};
		} catch (err) {
			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({ ok: false, error: err.message }, null, 2)
					}],
					isError: true
				}
			};
		}
	}

	return {
		jsonrpc: "2.0",
		id,
		error: { code: -32601, message: `Method not found: ${method}` }
	};
}

async function runMcpServer() {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	rl.on("line", async (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			const req = JSON.parse(trimmed);
			const res = await handleJsonRpc(req);
			if (res) {
				process.stdout.write(`${JSON.stringify(res)}\n`);
			}
		} catch (err) {
			process.stdout.write(
				`${JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: { code: -32700, message: "Parse error" }
				})}\n`
			);
		}
	});
}

runMcpServer();
