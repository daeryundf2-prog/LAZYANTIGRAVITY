import { readValue } from "./cli-arg-parser.js";
import { printJson } from "./cli-output.js";
import { buildEvidenceDraft } from "./evidence-draft.js";
import { UlwLoopError } from "./types.js";

export async function evidenceDraftCmd(repoRoot: string, argv: readonly string[], json: boolean): Promise<number> {
	const runId = readValue(argv, "--run-id")?.trim() || "default-run";
	if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
		throw new UlwLoopError(`Invalid --run-id: must match ^[A-Za-z0-9._-]+$`, "ULW_LOOP_ARGUMENT_INVALID");
	}
	const goalId = readValue(argv, "--goal-id")?.trim() || undefined;
	const result = await buildEvidenceDraft(repoRoot, runId, goalId);
	if (json) printJson({ ok: true, draftPath: result.draftPath, warnings: result.warnings, envelope: result.envelope });
	else {
		process.stdout.write(`Evidence draft written: ${result.draftPath}\n`);
		for (const warning of result.warnings) process.stdout.write(`- ${warning}\n`);
		process.stdout.write(`Submit with: checkpoint --goal-id <id> --status complete --quality-gate-json "${result.draftPath}"\n`);
	}
	return 0;
}
