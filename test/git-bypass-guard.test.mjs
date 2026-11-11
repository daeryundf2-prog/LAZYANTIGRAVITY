import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { bypassReason } from "../scripts/git-bypass-guard.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(root, "scripts", "git-bypass-guard.mjs");
const run = (payload) => JSON.parse(execFileSync(process.execPath, [script], { input: JSON.stringify(payload), encoding: "utf8" }).trim());

test("#given hook-skipping git commands #when checked #then each is denied", () => {
	for (const cmd of [
		'git commit -m "wip" --no-verify',
		"git commit -nm wip",
		"git commit -n -m wip",
		"git push --no-verify origin main",
		"npm test && git commit --no-verify -am x",
		"git -c core.hooksPath=/dev/null commit -m x",
		"git -c CORE.HOOKSPATH=/tmp/x push",
		"git config core.hooksPath .nohooks",
		"git config --global core.hooksPath /tmp/empty",
	]) {
		assert.notEqual(bypassReason(cmd), null, cmd);
	}
});

test("#given ordinary git commands #when checked #then none is denied", () => {
	for (const cmd of [
		'git commit -m "no-verify flag is discussed here"',
		"git commit -am fix",
		"git commit -m -n",
		"git config --get core.hooksPath",
		"git log --no-merges",
		"git push origin main",
		"git -C ../repo status",
		"echo --no-verify",
	]) {
		assert.equal(bypassReason(cmd), null, cmd);
	}
});

test("#given an Antigravity payload #when denied #then output uses decision/reason", () => {
	const out = run({ toolCall: { name: "run_command", args: { CommandLine: "git commit --no-verify -m x" } } });
	assert.equal(out.decision, "deny");
	assert.match(out.reason, /--no-verify/);
});

test("#given a Codex/Claude payload #when denied #then output uses hookSpecificOutput", () => {
	const out = run({ tool_name: "Bash", tool_input: { command: "git push --no-verify" } });
	assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
	assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
});

test("#given an allowed command or junk input #when run #then passes with {}", () => {
	assert.deepEqual(run({ tool_name: "Bash", tool_input: { command: "git status" } }), {});
	assert.deepEqual(JSON.parse(execFileSync(process.execPath, [script], { input: "not json", encoding: "utf8" }).trim()), {});
});
