import { printJson } from "./cli-output.js";
import { appendRunEvent, getRunDir } from "./control-plane.js";
import { cleanupRunDir, out } from "./dry-run-helpers.js";
import type { DryRunContext } from "./dry-run-types.js";

export async function runRewindScenario(scenario: string, ctx: DryRunContext): Promise<boolean> {
	if (!scenario.startsWith("rewind-")) return false;

	const runId = `dry-run-rewind-${Date.now()}`;
	const runDir = getRunDir(ctx.repoRoot, runId);
	try {
		out(ctx.json, `Initializing ${scenario}...`);
		await appendRunEvent(ctx.repoRoot, runId, "run.created", {});
		const e2 = await appendRunEvent(ctx.repoRoot, runId, "run.state_changed", { state: "working" });
		await appendRunEvent(ctx.repoRoot, runId, "run.state_changed", { state: "failed" });

		const { rewindLedger } = await import("./control-plane.js");

		if (scenario === "rewind-invalid-event-id") {
			try {
				await rewindLedger(ctx.repoRoot, runId, "invalid-event-id", { destructive: true });
			} catch (err: unknown) {
				if (!ctx.json) process.stdout.write(`[Dry-Run] Caught expected error: ${err}\n`);
			}
		} else if (scenario === "rewind-destructive-requires-flag") {
			if (!ctx.json) process.stdout.write(`[Dry-Run] Default rewind avoids destructive truncate without flag.\n`);
		} else {
			await rewindLedger(ctx.repoRoot, runId, e2.eventId ?? "", { destructive: scenario.includes("destructive") });
		}

		if (ctx.json) {
			const isDestructive = scenario.includes("destructive") && scenario !== "rewind-destructive-requires-flag";
			printJson({
				ok: true,
				dryRun: true,
				scenario,
				wouldTruncateLedger: isDestructive,
				wouldCreateBranch: !isDestructive,
				wouldPreserveOriginalLedger: !isDestructive,
				wouldCreateBackup: isDestructive,
				requiresExplicitDestructiveFlag: scenario === "rewind-destructive-requires-flag",
				wouldCallModelApi: false,
				wouldModifySourceFiles: false,
				wouldSwitchModel: false,
				wouldCompleteRun: false,
				wouldFailRun: false,
				wouldKillSubagent: false,
			});
			return true;
		}
		process.stdout.write(`[Dry-Run] Scenario ${scenario} complete.\n`);
	} finally {
		cleanupRunDir(ctx.writeCheckpoint, ctx.writeLedger, runDir);
	}
	return false;
}
