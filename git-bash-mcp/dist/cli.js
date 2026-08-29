#!/usr/bin/env node
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";

const TOOLS = [
	{
		name: "git_bash_execute",
		description:
			"Execute a workspace-confined, read-only-by-default command without shell chaining. " +
			"Allowed binaries: git (read-only subcommands only), pwd, ls, echo. " +
			"Destructive and network git subcommands are always denied; a narrow set of git write " +
			"subcommands requires the LAZYANTIGRAVITY_GIT_WRITE=1 environment opt-in.",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string", description: "Safe command to execute (e.g. 'git status', 'pwd', 'ls')" },
				cwd: { type: "string", description: "Working directory path (must stay inside the workspace root)" }
			},
			required: ["command"]
		}
	}
];

const STRICT_ALLOWED_BINARIES = new Set(["git", "pwd", "ls", "echo"]);
// `!` blocks git -c alias.<name>='!<shell>' config injection; the rest blocks
// chaining, redirection, substitution and output capture.
const SHELL_METASYMBOLS = /[;&|`$><()\\!\n\r]/;

const OUTPUT_LIMIT_BYTES = 1024 * 1024;

// Subcommands that never touch the worktree, the index, remotes or credentials.
const GIT_READ_ONLY_SUBCOMMANDS = new Set([
	"status", "rev-parse", "describe", "ls-files",
	"blame", "cat-file", "for-each-ref",
	"count-objects", "fsck", "version", "help", "interpret-trailers",
]);
// Read-only forms of polymorphic subcommands (empty/listing invocations).
const GIT_LISTING_ONLY_ARGS = new Set(["-l", "--list", "-v", "-vv", "-a", "--all", "-r", "--remotes", "-n", "--show-current", "--verbose"]);
// Subcommands allowed only with LAZYANTIGRAVITY_GIT_WRITE=1 (local mutations).
const GIT_WRITE_GATED_SUBCOMMANDS = new Set([
	"add", "commit", "checkout", "switch", "restore", "merge", "mv", "rm",
	"notes", "archive", "bisect", "rerere", "maintenance", "gc", "prune",
]);
// Always denied: destroys history/worktree, reaches the network, or runs commands.
const GIT_ALWAYS_DENIED_SUBCOMMANDS = new Set([
	"push", "pull", "fetch", "clone", "reset", "clean", "rebase", "revert",
	"cherry-pick", "am", "apply", "format-patch", "bundle", "submodule",
	"filter-branch", "filter-repo", "fast-import", "send-email", "instaweb",
	"http-backend", "daemon", "config", "update-ref", "symbolic-ref",
	"replace", "repack", "citool", "gui",
]);

function tokenizeCommand(str) {
	const tokens = [];
	let current = "";
	let inQuote = null;
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (inQuote) {
			if (char === inQuote) {
				inQuote = null;
			} else {
				current += char;
			}
		} else if (char === '"' || char === "'") {
			inQuote = char;
		} else if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}
	if (inQuote) {
		return { ok: false, error: "Unmatched quote in command." };
	}
	if (current.length > 0) {
		tokens.push(current);
	}
	return { ok: true, tokens };
}

function getWorkspaceRoot() {
	return resolve(process.env["LAZYANTIGRAVITY_WORKSPACE_ROOT"] || process.cwd());
}

function isInsideRoot(candidate, root) {
	const withSep = candidate.endsWith(sep) ? candidate : candidate + sep;
	return withSep.startsWith(root.endsWith(sep) ? root : root + sep);
}

// Rejects path-like tokens that resolve outside the workspace root. Tokens that
// do not look like paths (revs such as HEAD~2, ranges such as main..dev) pass.
function pathArgumentError(token, cwd) {
	if (token.startsWith("-")) return null;
	const looksLikePath = token.startsWith("~") || token.includes("/") || token.includes("\\") ||
		isAbsolute(token) || /^[A-Za-z]:[\\/]/.test(token) || token === "..";
	if (!looksLikePath) return null;
	const root = getWorkspaceRoot();
	let candidate;
	if (token.startsWith("~")) {
		candidate = resolve(cwd, homedir(), token.slice(1));
	} else {
		candidate = resolve(cwd, token);
	}
	if (!isInsideRoot(candidate, root)) {
		return `Path '${token}' resolves outside the workspace root (${root}) and is not permitted.`;
	}
	return null;
}

// Returns null when the invocation is allowed, otherwise a rejection reason.
function gitPolicyError(subcommand, args) {
	if (GIT_ALWAYS_DENIED_SUBCOMMANDS.has(subcommand)) {
		return `git ${subcommand} is denied (destructive, network-reaching or command-executing).`;
	}
	const writeOptIn = process.env["LAZYANTIGRAVITY_GIT_WRITE"] === "1";

	switch (subcommand) {
		// Log-family subcommands: block arbitrary-file reads and external drivers.
		case "diff":
		case "log":
		case "show":
		case "whatchanged":
		case "shortlog":
		case "reflog": {
			for (const arg of args) {
				if (arg === "--no-index") {
					return "git diff --no-index is denied (reads arbitrary filesystem paths).";
				}
				if (arg === "--ext-diff" || arg === "--textconv") {
					return "git --ext-diff/--textconv are denied (execute configured external commands).";
				}
				if (arg.startsWith("--output")) {
					return "git --output redirection is not permitted in read-only mode.";
				}
			}
			return null;
		}
		case "grep": {
			for (const arg of args) {
				if (arg === "-O" || arg === "--open-files-in-pager") {
					return "git grep pager spawning (-O) is not permitted.";
				}
			}
			return null;
		}
		case "branch":
		case "tag": {
			const isListing = args.length === 0 || args.every((a) => GIT_LISTING_ONLY_ARGS.has(a));
			if (isListing || writeOptIn) return null;
			return `git ${subcommand} with mutation arguments requires LAZYANTIGRAVITY_GIT_WRITE=1.`;
		}
		case "stash": {
			const head = args[0];
			const isRead = args.length === 0 || head === "list" || head === "show" || head === "log";
			if (isRead || writeOptIn) return null;
			return "git stash mutation requires LAZYANTIGRAVITY_GIT_WRITE=1.";
		}
		case "remote": {
			const head = args[0];
			const isRead = args.length === 0 || head === "-v" || head === "--verbose" || head === "get-url";
			if (isRead || writeOptIn) return null;
			return "git remote mutation requires LAZYANTIGRAVITY_GIT_WRITE=1.";
		}
		default: {
			if (GIT_READ_ONLY_SUBCOMMANDS.has(subcommand)) return null;
			if (GIT_WRITE_GATED_SUBCOMMANDS.has(subcommand)) {
				if (writeOptIn) return null;
				return `git ${subcommand} is a write subcommand and requires LAZYANTIGRAVITY_GIT_WRITE=1.`;
			}
			return `git ${subcommand} is not on the allowlist.`;
		}
	}
}

function parseSafeCommand(commandStr) {
	if (!commandStr || typeof commandStr !== "string") {
		return { ok: false, error: "Command must be a non-empty string." };
	}

	const trimmed = commandStr.trim();
	if (SHELL_METASYMBOLS.test(trimmed)) {
		return { ok: false, error: "Command chaining and shell metacharacters (; & | ` $ > < \\ !) are strictly prohibited." };
	}

	const tokenized = tokenizeCommand(trimmed);
	if (!tokenized.ok) {
		return { ok: false, error: tokenized.error };
	}

	const tokens = tokenized.tokens;
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

	// git: no global flags (blocks -c config injection, -C root escape, --exec-path, ...),
	// then enforce the subcommand policy.
	if (binary === "git") {
		if (args[0]?.startsWith("-")) {
			return { ok: false, error: "Global git flags (git -c/-C/...) are not permitted." };
		}
		const subcommand = args[0]?.toLowerCase();
		if (!subcommand) {
			return { ok: false, error: "git requires a subcommand." };
		}
		const policyError = gitPolicyError(subcommand, args.slice(1));
		if (policyError) {
			return { ok: false, error: policyError };
		}
	}

	// Confine every path-like argument to the workspace root.
	const defaultCwd = getWorkspaceRoot();
	for (const arg of args) {
		const pathError = pathArgumentError(arg, defaultCwd);
		if (pathError) {
			return { ok: false, error: pathError };
		}
	}

	return { ok: true, binary, args };
}

function resolveConfinedCwd(cwdArg) {
	const root = getWorkspaceRoot();
	if (!cwdArg) {
		return { ok: true, cwd: root };
	}
	const candidate = resolve(root, cwdArg);
	if (!isInsideRoot(candidate, root)) {
		return { ok: false, error: `cwd '${cwdArg}' resolves outside the workspace root (${root}).` };
	}
	if (!existsSync(candidate)) {
		return { ok: false, error: `cwd '${cwdArg}' does not exist.` };
	}
	try {
		const real = realpathSync(candidate);
		if (!isInsideRoot(real, root)) {
			return { ok: false, error: `cwd '${cwdArg}' escapes the workspace root through a symlink.` };
		}
		return { ok: true, cwd: real };
	} catch {
		return { ok: true, cwd: candidate };
	}
}

function truncateOutput(text) {
	if (typeof text !== "string" || text.length <= OUTPUT_LIMIT_BYTES) return text;
	return `${text.slice(0, OUTPUT_LIMIT_BYTES)}\n[output truncated at ${OUTPUT_LIMIT_BYTES} bytes]`;
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
				serverInfo: { name: "git-bash-mcp", version: "0.2.0" }
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

		const cwdResult = resolveConfinedCwd(args.cwd);
		if (!cwdResult.ok) {
			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [{
						type: "text",
						text: JSON.stringify({ ok: false, error: cwdResult.error }, null, 2)
					}],
					isError: true
				}
			};
		}

		try {
			const res = spawnSync(parsed.binary, parsed.args, {
				cwd: cwdResult.cwd,
				encoding: "utf8",
				timeout: 10000,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"]
			});

			const stdout = truncateOutput((res.stdout || "").trim());
			const stderr = truncateOutput((res.stderr || "").trim());

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


// Startup guard: if the host launched this server from inside the plugin
// tree, workspace-scoped tools would silently operate on the plugin instead
// of the user's project. Warn loudly; do not refuse to run.
function warnIfWorkspaceLooksLikePluginRoot(name) {
	const pluginRoot = process.env["PLUGIN_ROOT"];
	if (!pluginRoot) return;
	const cwd = resolve(process.cwd());
	const root = resolve(pluginRoot);
	if (cwd === root || cwd.startsWith(root + sep)) {
		process.stderr.write(
			`[${name}] WARNING: cwd is inside PLUGIN_ROOT (${pluginRoot}); workspace-scoped tools would operate on the plugin tree, not the user's workspace. Set the server "cwd" to the user workspace in mcp_config.json, or set LAZYANTIGRAVITY_WORKSPACE_ROOT.\n`,
		);
	}
}

warnIfWorkspaceLooksLikePluginRoot("git-bash-mcp");

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
