#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Root resolution: test fixture override > host PLUGIN_ROOT > script location.
const PLUGIN_ROOT =
	process.env["UPDATE_CHECK_REPO_ROOT"] ||
	process.env["PLUGIN_ROOT"] ||
	dirname(dirname(fileURLToPath(import.meta.url)));

function git(args, timeoutMs = 5000) {
	return spawnSync("git", ["-C", PLUGIN_ROOT, ...args], { encoding: "utf8", timeout: timeoutMs });
}

function main() {
	if (process.env["LAZYANTIGRAVITY_OFFLINE"] === "1" || process.env["LAZYANTIGRAVITY_UPDATE_CHECK"] !== "1") process.exit(0);

	const fetch = git(["fetch", "origin", "main", "--quiet"], 5000);
	if (fetch.error || fetch.status !== 0) process.exit(0); // offline or non-repo: stay silent

	const head = git(["rev-parse", "HEAD"]).stdout.trim();
	const origin = git(["rev-parse", "origin/main"]).stdout.trim();
	if (!head || !origin || head === origin) process.exit(0);

	const behind = Number(git(["rev-list", "--count", "HEAD..origin/main"]).stdout.trim() || 0);
	const ahead = Number(git(["rev-list", "--count", "origin/main..HEAD"]).stdout.trim() || 0);
	if (behind === 0) process.exit(0);

	let message;
	if (ahead > 0) {
		message =
			`LazyAntigravity plugin has diverged from origin/main (${ahead} local, ${behind} remote commits). ` +
			`Reconcile with: git -C "${PLUGIN_ROOT}" pull --rebase`;
	} else {
		message =
			`LazyAntigravity plugin is ${behind} commit(s) behind origin/main. ` +
			`Update with: git -C "${PLUGIN_ROOT}" pull && restart Antigravity.`;
	}

	process.stdout.write(
		`${JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext: message,
			},
		})}\n`,
	);
	process.exit(0);
}

main();
