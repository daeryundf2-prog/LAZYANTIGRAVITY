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
const incompleteStatuses = new Set(["complete", "completed", "done", "passed", "cancelled", "canceled"]);

if (existsSync(goalsPath)) {
	try {
		const goals = JSON.parse(readFileSync(goalsPath, "utf8"));
		const list = Array.isArray(goals) ? goals : goals?.goals;
		if (Array.isArray(list) && list.length > 0) {
			const incomplete = list.filter((g) => {
				const status = g?.status ?? g?.state;
				if (!status) return true;
				return !incompleteStatuses.has(String(status).toLowerCase());
			});
			if (incomplete.length > 0) {
				const ids = incomplete
					.slice(0, 5)
					.map((g) => g?.id ?? g?.goalId ?? g?.name ?? "?")
					.join(", ");
				lines.push(
					`LazyAntigravity HARD STOP: ${incomplete.length} ULW goal(s) still open (${ids}${incomplete.length > 5 ? ", …" : ""}). Do NOT claim done, ship, or close the session until: node "${cliPath}" ulw-loop status --json shows all criteria pass AND ledger evidence exists for each.`,
				);
				lines.push(
					"LazyAntigravity: Treat worker DoneClaim as untrusted. Re-run failing criteria, capture Manual-QA artifacts, then record-evidence before flipping any checkbox.",
				);
			}
		}
	} catch {
		lines.push(
			"LazyAntigravity HARD STOP: .omo/ulw-loop/goals.json exists but could not be parsed. Fix or recreate goals before claiming completion.",
		);
	}
} else if (existsSync(ledgerPath)) {
	lines.push(
		"LazyAntigravity: ledger.jsonl present without goals.json — re-read the ledger and restore goals before claiming completion.",
	);
}

if (existsSync(ledgerPath)) {
	try {
		const raw = readFileSync(ledgerPath, "utf8").trim();
		if (raw.length > 0) {
			const lastLines = raw.split(/\r?\n/).filter(Boolean).slice(-20);
			const hasFailOrBlocked = lastLines.some((line) => {
				try {
					const row = JSON.parse(line);
					const status = String(row?.status ?? row?.result ?? "").toLowerCase();
					return status === "fail" || status === "failed" || status === "blocked";
				} catch {
					return /"status"\s*:\s*"(fail|failed|blocked)"/i.test(line);
				}
			});
			if (hasFailOrBlocked) {
				lines.push(
					"LazyAntigravity HARD STOP: recent ledger entries include fail/blocked. Do not claim ULW complete until those criteria are re-run to pass with cleanup receipts.",
				);
			}
		}
	} catch {
		lines.push("LazyAntigravity: ledger.jsonl could not be read; treat completion claims as unverified.");
	}
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
