#!/usr/bin/env node
/**
 * FAIL_OPEN Stop/Session helper: warn when ULW CLI is missing or ledger shows incomplete work.
 * Emits JSON with additionalContext when useful; otherwise empty object.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot =
	process.env.PLUGIN_ROOT?.trim() ||
	process.env.LAZYANTIGRAVITY_ROOT?.trim() ||
	join(dirname(fileURLToPath(import.meta.url)), "..");

const cwd = process.env.OMO_REPO_ROOT?.trim() || process.cwd();
const lines = [];

const cliPath = join(pluginRoot, "components", "ulw-loop", "dist", "cli.js");
if (!existsSync(cliPath)) {
	lines.push(
		`LazyAntigravity: ULW CLI missing at ${cliPath}. Set PLUGIN_ROOT or reinstall the plugin before /ulw.`,
	);
} else {
	lines.push(
		`LazyAntigravity: ULW CLI ready → node "${cliPath}" ulw-loop … (Antigravity default).`,
	);
}

const goalsPath = join(cwd, ".omo", "ulw-loop", "goals.json");
const ledgerPath = join(cwd, ".omo", "ulw-loop", "ledger.jsonl");
if (existsSync(goalsPath)) {
	try {
		const goals = JSON.parse(readFileSync(goalsPath, "utf8"));
		const list = Array.isArray(goals) ? goals : goals?.goals;
		if (Array.isArray(list) && list.length > 0) {
			const incomplete = list.filter((g) => {
				const status = g?.status ?? g?.state;
				return status && !["complete", "completed", "done", "passed"].includes(String(status).toLowerCase());
			});
			if (incomplete.length > 0) {
				lines.push(
					`LazyAntigravity: ${incomplete.length} ULW goal(s) still open under .omo/ulw-loop. Do not claim done without omo ulw-loop status --json + evidence.`,
				);
			}
		}
	} catch {
		lines.push("LazyAntigravity: .omo/ulw-loop/goals.json exists but could not be parsed.");
	}
} else if (existsSync(ledgerPath)) {
	lines.push(
		"LazyAntigravity: ledger.jsonl present without goals.json — re-read ledger before claiming completion.",
	);
}

if (lines.length === 0) {
	process.stdout.write("{}\n");
} else {
	process.stdout.write(
		`${JSON.stringify({
			additionalContext: lines.join("\n"),
		})}\n`,
	);
}
