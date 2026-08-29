#!/usr/bin/env node
import { ulwLoopCommand } from "./cli-commands.js";
import { runPostCompactHookCli, runPreToolUseGoalBudgetGuardCli, runUlwLoopHookCli } from "./codex-hook.js";

const ULW_LOOP_SUBCOMMANDS = new Set([
	"create-goals", "complete-goals", "status", "checkpoint", "steer", "add-goal",
	"criteria", "record-evidence", "record-review-blockers", "save-role-checkpoint",
	"resume", "dry-run", "init-run", "set-run-state", "dispatch-agent", "claim-agent",
	"heartbeat-agent", "progress-agent", "report-complete", "report-failed", "ack-agent",
	"reject-agent", "check-leases", "register-poller", "rewind", "dispatch-consensus",
	"consensus-pending", "report-consensus-result", "aggregate-consensus",
]);

const TOP_LEVEL_HELP =
	"Usage:\n  lazyantigravity ulw-loop <subcommand> [args]\n  lazyantigravity hook user-prompt-submit         (Codex UserPromptSubmit hook)\n  lazyantigravity help | --help | -h              (this message)\n\nAlias: `omo` is accepted. Run `lazyantigravity ulw-loop help` for ulw-loop subcommands.\n";

async function main(): Promise<number> {
	const argv = process.argv.slice(2);
	const command = argv[0];
	if (command === undefined || command === "help" || command === "--help" || command === "-h") {
		process.stdout.write(TOP_LEVEL_HELP);
		return 0;
	}
	if (command === "ulw-loop") return ulwLoopCommand(argv.slice(1));
	if (command === "hook") {
		const sub = argv[1];
		if (sub === "user-prompt-submit") {
			await runUlwLoopHookCli(process.stdin, process.stdout);
			return 0;
		}
		if (sub === "pre-tool-use") {
			await runPreToolUseGoalBudgetGuardCli(process.stdin, process.stdout);
			return 0;
		}
		if (sub === "post-compact") {
			await runPostCompactHookCli(process.stdin, process.stdout);
			return 0;
		}
		process.stderr.write(`[omo] unknown hook subcommand: ${sub ?? "(none)"}\n`);
		return 1;
	}
	process.stderr.write(`[omo] unknown command: ${command}\n`);
	if (ULW_LOOP_SUBCOMMANDS.has(command)) {
		process.stderr.write(`[omo] hint: '${command}' is a ulw-loop subcommand — run: ulw-loop ${command} ...\n`);
	}
	process.stderr.write(TOP_LEVEL_HELP);
	return 1;
}

main()
	.then((code) => {
		process.exit(code);
	})
	.catch((error: unknown) => {
		process.stderr.write(`[omo] ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	});
