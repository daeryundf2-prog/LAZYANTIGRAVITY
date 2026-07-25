const SHELL_COMMANDS = new Set(["bash", "sh", "zsh", "dash", "ash", "csh", "tcsh", "ksh", "fish"]);
const WRAPPER_COMMANDS = new Set([
	...SHELL_COMMANDS, "sudo", "env", "exec", "nohup", "timeout", "nice",
	"ionice", "stdbuf", "doas", "setsid", "time", "xargs", "command",
	"powershell", "pwsh", "busybox", "toybox", "eval",
]);
const OPAQUE_WRAPPERS = new Set([...SHELL_COMMANDS, "cmd", "cmd.exe", "eval", "powershell", "powershell.exe", "pwsh"]);

const GIT_DESTRUCTIVE_SUBCOMMANDS = new Set(["reset", "clean", "stash", "read-tree", "checkout", "restore", "switch"]);
const REMOVE_COMMANDS = new Set(["rm", "rmdir", "del", "remove-item", "rd"]);
const TRUNCATE_COMMANDS = new Set(["set-content", "out-file"]);
const COMMAND_SEPARATORS = new Set(["&&", "||", ";", "|"]);

const CATEGORY_GIT = "git_destructive";
const CATEGORY_REMOVE = "os_remove";
const CATEGORY_TRUNCATE = "truncate_redirect";

const SEPARATOR_RE = /(?:^|\s)(?:&&|\|\||;|\||\n)(?:\s|$)/;

function tokenize(command) {
	try {
		return command.trim().split(/\s+/).filter(Boolean);
	} catch {
		return [];
	}
}

function commandName(token) {
	const name = token.replace(/\\/g, "/").split("/").pop().toLowerCase();
	return name.replace(/\.exe$/, "");
}

function unquote(token) {
	if (token.length >= 2 && token[0] === token[token.length - 1] && (token[0] === "'" || token[0] === '"')) {
		return token.slice(1, -1);
	}
	return token;
}

function validateTarget(target) {
	if (!target) return "parse_unable";
	if (/[*?\[\]{}]/.test(target)) return "parse_unable";
	if (target.includes("$") || target.includes("%")) return "parse_unable";
	if (["/", "\\", "~", ".", "./", ".\\"].includes(target.trim()) || target.trim().startsWith("~")) return "implicit_scope";
	return "ok";
}

function blocked(category, reason) {
	return { category, resolved: false, targets: [], reason };
}

function detectGit(tokens) {
	if (commandName(tokens[0]) !== "git") return null;
	if (tokens.length < 2) return null;
	const subcommand = tokens[1].toLowerCase();
	if (!GIT_DESTRUCTIVE_SUBCOMMANDS.has(subcommand)) {
		if (tokens[1].startsWith("-")) return blocked(CATEGORY_GIT, "parse_unable_subcommand");
		return null;
	}
	if (["reset", "clean", "stash", "read-tree"].includes(subcommand)) {
		return blocked(CATEGORY_GIT, "implicit_scope");
	}
	if (subcommand === "switch") {
		const flags = new Set(tokens.slice(2).map((t) => t.toLowerCase()));
		if (flags.has("--discard-changes")) return blocked(CATEGORY_GIT, "implicit_scope");
		return null;
	}
	const rest = tokens.slice(2);
	if (subcommand === "checkout") {
		const forceIdx = rest.findIndex((t) => t === "--force" || t === "-f");
		if (forceIdx >= 0) return blocked(CATEGORY_GIT, "implicit_scope");
		if (rest.some((t) => t === "-b" || t === "-B")) return null;
	}
	const targets = [];
	for (const raw of rest) {
		if (COMMAND_SEPARATORS.has(raw)) break;
		if (raw === "--") continue;
		if (raw.startsWith("-")) continue;
		if (raw.startsWith("--pathspec-from-file")) return blocked(CATEGORY_GIT, "parse_unable_pathspec_from_file");
		const target = unquote(raw);
		const validity = validateTarget(target);
		if (validity === "ok") targets.push(target);
		else if (validity === "implicit_scope") return blocked(CATEGORY_GIT, "implicit_scope");
		else return blocked(CATEGORY_GIT, "parse_unable_target");
	}
	if (targets.length === 0) return null;
	return { category: CATEGORY_GIT, resolved: true, targets, reason: "" };
}

function detectRemove(tokens) {
	if (!REMOVE_COMMANDS.has(commandName(tokens[0]))) return null;
	const targets = [];
	for (let i = 1; i < tokens.length; i++) {
		const token = tokens[i];
		if (COMMAND_SEPARATORS.has(token)) break;
		if (token.startsWith("-") || token.startsWith("/")) continue;
		const target = unquote(token);
		const validity = validateTarget(target);
		if (validity === "ok") targets.push(target);
		else if (validity === "implicit_scope") return blocked(CATEGORY_REMOVE, "implicit_scope");
		else return blocked(CATEGORY_REMOVE, "parse_unable_target");
	}
	if (targets.length === 0) return blocked(CATEGORY_REMOVE, "implicit_scope");
	return { category: CATEGORY_REMOVE, resolved: true, targets, reason: "" };
}

function detectTruncateRedirect(tokens) {
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const match = token.match(/^(\d*)(>>?|&>>?)(.*)$/);
		if (!match) continue;
		let target = match[3];
		if (!target) {
			if (i + 1 >= tokens.length) return blocked(CATEGORY_TRUNCATE, "parse_unable_missing_target");
			target = unquote(tokens[i + 1]);
		}
		if (target === "-" || /^\d+$/.test(target)) continue;
		const validity = validateTarget(target);
		if (validity === "ok") return { category: CATEGORY_TRUNCATE, resolved: true, targets: [target], reason: "" };
		if (validity === "implicit_scope") return blocked(CATEGORY_TRUNCATE, "implicit_scope");
		return blocked(CATEGORY_TRUNCATE, "parse_unable_target");
	}
	return null;
}

function detectTee(tokens) {
	if (commandName(tokens[0]) !== "tee") return null;
	const targets = [];
	let append = false;
	let afterDash = false;
	for (const raw of tokens.slice(1)) {
		const token = unquote(raw);
		if (!afterDash && token === "--") { afterDash = true; continue; }
		if (!afterDash && (token === "--help" || token === "--version")) return null;
		if (!afterDash && token === "--append") { append = true; continue; }
		if (!afterDash && token.startsWith("-") && token !== "-") {
			if (token.includes("a")) append = true;
			continue;
		}
		if (token !== "-") targets.push(token);
	}
	if (append || targets.length === 0) return null;
	const validated = [];
	for (const target of targets) {
		const validity = validateTarget(target);
		if (validity === "ok") validated.push(target);
		else if (validity === "implicit_scope") return blocked(CATEGORY_TRUNCATE, "implicit_scope");
		else return blocked(CATEGORY_TRUNCATE, "parse_unable_target");
	}
	return { category: CATEGORY_TRUNCATE, resolved: true, targets: validated, reason: "" };
}

function detectWrapper(tokens) {
	const wrapper = commandName(tokens[0]);
	if (!WRAPPER_COMMANDS.has(wrapper)) return null;
	let payload = tokens.slice(1);
	while (payload.length && (payload[0].startsWith("-") || payload[0].startsWith("/"))) {
		payload = payload.slice(1);
	}
	if (wrapper === "env") {
		while (payload.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(payload[0])) payload = payload.slice(1);
	}
	if (wrapper === "timeout" && payload.length) payload = payload.slice(1);
	if (!payload.length) return null;
	const nested = parseDestructiveCommand(payload.join(" "));
	if (nested) {
		if (OPAQUE_WRAPPERS.has(wrapper)) return blocked(nested.category, "parse_unable_wrapped");
		return nested;
	}
	return null;
}

function detectFindDelete(tokens) {
	if (commandName(tokens[0]) !== "find") return null;
	for (let i = 1; i < tokens.length; i++) {
		const token = tokens[i].toLowerCase();
		if (token === "-delete") return blocked(CATEGORY_REMOVE, "implicit_scope");
		if (["-exec", "-execdir", "-ok", "-okdir"].includes(token)) {
			const end = tokens.slice(i + 1).findIndex((t) => t === ";" || t === "+");
			if (end < 0) return blocked(CATEGORY_REMOVE, "parse_unable_shell_syntax");
			const nestedCmd = tokens.slice(i + 1, i + 1 + end).join(" ");
			const nested = parseDestructiveCommand(nestedCmd);
			if (nested) return nested;
			i = i + 1 + end;
		}
	}
	return null;
}

const DETECTORS = [detectTee, detectTruncateRedirect, detectGit, detectRemove, detectFindDelete, detectWrapper];

export function parseDestructiveCommand(command) {
	const segments = splitCommandSegments(command);
	for (const segment of segments) {
		const tokens = tokenize(segment);
		if (!tokens.length) continue;
		const commandPosTokens = tokens;
		for (const detector of DETECTORS) {
			const result = detector(commandPosTokens);
			if (result) return result;
		}
	}
	return null;
}

export function parseDestructiveCommands(command) {
	const segments = splitCommandSegments(command);
	const results = [];
	for (const segment of segments) {
		const tokens = tokenize(segment);
		if (!tokens.length) continue;
		for (const detector of DETECTORS) {
			const result = detector(tokens);
			if (result && !results.some((r) => JSON.stringify(r) === JSON.stringify(result))) {
				results.push(result);
			}
		}
	}
	return results;
}

function splitCommandSegments(command) {
	return command
		.split(SEPARATOR_RE)
		.map((s) => s.trim())
		.filter(Boolean);
}

import { hasUnsettledPeer, canonicalizePath } from "./audit-ledger.mjs";

const REQUIRE = globalThis.require;
const dynamicImport = REQUIRE
	? (mod) => REQUIRE(mod)
	: null;

function resolveLedgerModule() {
	return { hasUnsettledPeer, canonicalizePath };
}

export function evaluateR2Gate(workspaceRoot, command, agentKey) {
	const parsed = parseDestructiveCommand(command);
	if (!parsed) return { decision: "allow", reason: "" };
	if (!parsed.resolved) {
		return {
			decision: "deny",
			reason: `R2 destructive guard: command classified as ${parsed.category} but target could not be resolved (${parsed.reason}). Fail-closed.`,
		};
	}
	const { hasUnsettledPeer: hasPeer, canonicalizePath: canon } = resolveLedgerModule();
	for (const target of parsed.targets) {
		const canonical = canon(workspaceRoot, target);
		if (canonical === null) {
			return {
				decision: "deny",
				reason: `R2 destructive guard: target "${target}" could not be canonicalized. Fail-closed.`,
			};
		}
		const peerUnsettled = hasPeer(workspaceRoot, canonical, agentKey);
		if (peerUnsettled) {
			return {
				decision: "deny",
				reason: `R2 destructive guard: target "${canonical}" is owned by an unsettled peer. ` +
					`해소 절차: ① 소유 에이전트 본인이 자기 세션에서 실행 ② settlement 후 실행 ③ 사용자가 직접 실행(훅 밖).`,
			};
		}
	}
	return { decision: "allow", reason: "" };
}
