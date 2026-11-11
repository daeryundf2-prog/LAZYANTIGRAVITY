#!/usr/bin/env node
/**
 * PreToolUse guard: deny git invocations that skip repository hooks.
 *
 * components/rules/AGENTS.md already forbids bypassing hooks, but nothing
 * enforced it outside Windows (git-bash only runs there). Denied:
 *   - git commit/push/merge/rebase/cherry-pick/am/revert with --no-verify
 *   - git commit with -n (alone or inside a short-flag cluster)
 *   - any git call with `-c core.hooksPath=...`
 *   - `git config [--global|--local] core.hooksPath <value>` (setting it)
 *
 * Output follows the host that sent the payload: Antigravity (`toolCall`)
 * gets {decision, reason}; Codex/Claude (`tool_input`) gets hookSpecificOutput.
 * Anything unparseable passes (the runner is FAIL_OPEN).
 */

import { pathToFileURL } from "node:url";

const VERIFY_SUBCOMMANDS = new Set(["commit", "push", "merge", "rebase", "cherry-pick", "am", "revert"]);
const SEPARATORS = /\s*(?:&&|\|\||;|\||\n)\s*/;

async function readStdin() {
	let data = "";
	for await (const chunk of process.stdin) data += chunk;
	return data;
}

function tokenize(segment) {
	const tokens = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let m;
	while ((m = re.exec(segment)) !== null) tokens.push(m[1] ?? m[2] ?? m[3]);
	return tokens;
}

export function bypassReason(command) {
	for (const segment of command.split(SEPARATORS)) {
		const tokens = tokenize(segment);
		const gitAt = tokens.findIndex((t) => t === "git" || t.endsWith("/git"));
		if (gitAt === -1) continue;
		const args = tokens.slice(gitAt + 1);
		let i = 0;
		while (i < args.length && args[i].startsWith("-")) {
			if (args[i] === "-c" && /^core\.hookspath=/i.test(args[i + 1] ?? "")) {
				return "git -c core.hooksPath=… replaces the repository hooks";
			}
			i += args[i] === "-c" || args[i] === "-C" ? 2 : 1;
		}
		const sub = args[i];
		const rest = args.slice(i + 1);
		if (sub === "config") {
			const keyAt = rest.findIndex((t) => /^core\.hookspath$/i.test(t));
			const reading = rest.some((t) => t === "--get" || t === "--get-all" || t === "--list" || t === "-l" || t === "--unset");
			if (keyAt !== -1 && !reading && rest.length > keyAt + 1) return "git config core.hooksPath replaces the repository hooks";
		}
		if (VERIFY_SUBCOMMANDS.has(sub) && rest.includes("--no-verify")) return `git ${sub} --no-verify skips the repository hooks`;
		if (sub === "commit") {
			for (let j = 0; j < rest.length; j++) {
				const t = rest[j];
				if (t === "-m" || t === "-F" || t === "-C" || t === "-c") {
					j++;
					continue;
				}
				if (/^-[a-zA-Z]+$/.test(t) && t.includes("n")) return "git commit -n (--no-verify) skips the repository hooks";
			}
		}
	}
	return null;
}

function extract(payload) {
	if (payload?.toolCall) {
		const args = payload.toolCall.args ?? {};
		return { host: "antigravity", command: args.CommandLine ?? args.command ?? "" };
	}
	const input = payload?.tool_input ?? payload?.toolInput ?? {};
	return { host: "codex", command: typeof input === "string" ? input : (input.command ?? input.cmd ?? "") };
}

async function main() {
	let payload;
	try {
		payload = JSON.parse(await readStdin());
	} catch {
		process.stdout.write("{}\n");
		return;
	}
	const { host, command } = extract(payload);
	const reason = typeof command === "string" ? bypassReason(command) : null;
	if (reason === null) {
		process.stdout.write("{}\n");
		return;
	}
	const message = `LazyAntigravity: ${reason}. Fix what the hook reports instead of skipping it.`;
	const output =
		host === "antigravity"
			? { decision: "deny", reason: message }
			: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: message } };
	process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch(() => process.stdout.write("{}\n"));
}
