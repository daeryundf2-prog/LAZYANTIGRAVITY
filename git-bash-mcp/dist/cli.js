#!/usr/bin/env node
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const TOOLS = [
	{
		name: "git_bash_execute",
		description: "Execute a safe command within Git Bash / shell terminal environment.",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string", description: "Command line to execute" },
				cwd: { type: "string", description: "Working directory path" }
			},
			required: ["command"]
		}
	}
];

const ALLOWED_COMMAND_PREFIXES = [
	"git", "echo", "pwd", "ls", "cat", "node", "npm", "npx", "which", "where", "env", "printenv"
];

function isCommandAllowed(command) {
	if (!command || typeof command !== "string") return false;
	const trimmed = command.trim();
	// Check for dangerous shell chaining or dangerous root removal
	if (/rm\s+-rf\s+[\/\\]/i.test(trimmed)) return false;
	const firstToken = trimmed.split(/[\s;&|]/)[0].toLowerCase();
	return ALLOWED_COMMAND_PREFIXES.some((prefix) => firstToken === prefix || firstToken.endsWith(`/${prefix}`) || firstToken.endsWith(`\\${prefix}`));
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

		const command = args.command;
		const cwd = args.cwd ? resolve(process.cwd(), args.cwd) : process.cwd();

		if (!isCommandAllowed(command)) {
			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({
							ok: false,
							error: `Command '${command}' is not in the safe allowlist or contains prohibited patterns.`
						}, null, 2)
					}],
					isError: true
				}
			};
		}

		try {
			const stdout = execSync(command, {
				cwd,
				encoding: "utf8",
				timeout: 10000,
				stdio: ["pipe", "pipe", "pipe"]
			});
			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({ ok: true, output: stdout.trim() }, null, 2)
					}]
				}
			};
		} catch (err) {
			const output = (err.stdout || err.stderr || err.message || "").trim();
			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({ ok: false, output, exitCode: err.status ?? 1 }, null, 2)
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
