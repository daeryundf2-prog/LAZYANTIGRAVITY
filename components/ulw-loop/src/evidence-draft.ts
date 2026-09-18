import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRunDir, readRunEvents } from "./control-plane.js";
import type { StrictEvidenceEnvelope } from "./evidence-contract.js";
import { countFileSha256Pair } from "./evidence-draft-utils.js";

export interface EvidenceDraftResult {
	readonly draftPath: string;
	readonly envelope: StrictEvidenceEnvelope;
	readonly warnings: readonly string[];
}

export async function buildEvidenceDraft(
	repoRoot: string,
	runId: string,
	goalId?: string,
): Promise<EvidenceDraftResult> {
	const events = await readRunEvents(repoRoot, runId);
	const completed = events.filter((e) => e.type === "agent.completed_reported");
	const last = completed[completed.length - 1];
	if (!last?.result || typeof last.result !== "object") {
		throw new Error(`No agent.completed_reported event found for run ${runId}.`);
	}
	const result = last.result as Record<string, unknown>;
	const filesChanged = Array.isArray(result["filesChanged"]) ? (result["filesChanged"] as string[]) : [];
	const commandsRun = Array.isArray(result["commandsRun"]) ? (result["commandsRun"] as string[]) : [];

	const warnings: string[] = [];
	const readRanges: Array<{ file: string; startLine: number; endLine: number }> = [];
	const fileChecksums: Array<{ file: string; sha256: string }> = [];
	for (const file of filesChanged) {
		const pair = countFileSha256Pair(repoRoot, file);
		if (!pair.exists) {
			warnings.push(`filesChanged '${file}' does not exist on disk — create it or remove it from the draft.`);
			continue;
		}
		readRanges.push({ file, startLine: 1, endLine: Math.max(pair.lines, 1) });
		if (pair.sha256) fileChecksums.push({ file, sha256: pair.sha256 });
	}
	if (filesChanged.length > 0 && fileChecksums.length === 0) {
		warnings.push("none of the claimed files exist on disk yet — the draft cannot be submitted until they do.");
	}

	const envelope: StrictEvidenceEnvelope = {
		status: "not_checked",
		unknowns: ["Command outcomes and execution binding require trusted host execution records."],
		summary: `Evidence draft for ${goalId ?? runId} — verify every claim before checkpointing.`,
		filesChanged,
		readRanges,
		fileChecksums,
		commandsRun,
		commandAudits: commandsRun.map((command) => ({ command })),
	};
	if (commandsRun.length > 0) {
		warnings.push(
			"commandAudits are placeholders without outcomes — obtain trusted records for each command before submission.",
		);
	}
	warnings.push("the execution binding must match the run that actually produced this work.");

	const evidenceDir = join(getRunDir(repoRoot, runId), "..", "evidence");
	if (!existsSync(evidenceDir)) mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
	const draftPath = join(evidenceDir, `draft-${goalId ?? runId}.json`);
	writeFileSync(draftPath, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

	return { draftPath, envelope, warnings };
}
