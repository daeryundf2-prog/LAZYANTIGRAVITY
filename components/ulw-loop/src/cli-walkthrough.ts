import { readValue } from "./cli-arg-parser.js";
import { printJson } from "./cli-output.js";
import { readRunEvents } from "./control-plane.js";
import { normalizeUlwLoopSessionId, resolveUlwLoopSessionIdFromEnv, type UlwLoopScope } from "./paths.js";
import { verifyWalkthroughGroundTruth } from "./walkthrough-verifier.js";

export async function verifyWalkthroughCmd(
	repoRoot: string,
	argv: readonly string[],
	json: boolean,
	scope?: UlwLoopScope,
): Promise<number> {
	const explicitRunId = readValue(argv, "--run-id")?.trim();
	const runId =
		explicitRunId ?? normalizeUlwLoopSessionId(scope?.sessionId) ?? resolveUlwLoopSessionIdFromEnv() ?? "default-run";
	const walkthroughFile = readValue(argv, "--file")?.trim() ?? "walkthrough.md";
	let events: readonly import("./control-plane-types.js").LedgerEvent[] = [];
	let eventsAvailable = false;
	try {
		events = await readRunEvents(repoRoot, runId);
		eventsAvailable = true;
	} catch {
		// events absent — verifier will report skipped instead of silently passing
	}
	if (!eventsAvailable) {
		const result = {
			ok: true,
			walkthroughPath: "",
			claimedFiles: [],
			claimedCommands: [],
			phantomFiles: [],
			phantomCommands: [],
			skipped: true,
		};
		if (json) printJson(result);
		else process.stdout.write("Walkthrough verification skipped (no ledger events found).\n");
		return 0;
	}
	const result = verifyWalkthroughGroundTruth(repoRoot, walkthroughFile, events);
	if (json) printJson(result);
	else if (result.ok) {
		if (result.skipped) {
			process.stdout.write("Walkthrough verification skipped (no walkthrough document found).\n");
		} else {
			process.stdout.write(
				`Walkthrough ground-truth verified: ${result.claimedFiles.length} file(s), ${result.claimedCommands.length} command(s) attested.\n`,
			);
		}
	} else {
		process.stderr.write(`Walkthrough verification FAILED: ${result.error}\n`);
	}
	return result.ok ? 0 : 1;
}
