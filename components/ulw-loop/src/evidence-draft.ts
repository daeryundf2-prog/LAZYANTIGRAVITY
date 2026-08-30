import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRunDir, readRunEvents } from "./control-plane.js";
import { countFileSha256Pair } from "./evidence-draft-utils.js";
import type { StrictEvidenceEnvelope } from "./evidence-contract.js";

export interface EvidenceDraftResult {
	readonly draftPath: string;
	readonly envelope: StrictEvidenceEnvelope;
	readonly warnings: readonly string[];
}

/**
 * Scaffolds a strict evidence envelope from the run ledger so the agent only
 * has to verify (and fill command truths) instead of hand-assembling the
 * contract. Everything file-related is computed from the real disk; command
 * audits and the execution binding are placeholders the submitting agent is
 * accountable for — the checkpoint gate re-verifies every disk-verifiable
 * claim at submission time.
 */
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
		status: "verified",
		summary: `Evidence draft for ${goalId ?? runId} — verify every claim before checkpointing.`,
		filesChanged,
		readRanges,
		fileChecksums,
		commandsRun,
		commandAudits: commandsRun.map((command) => ({ command, exitCode: 0 })),
		executionBinding: {
			requestId: `draft-${Date.now().toString(36)}`,
			runId,
			sessionId: "draft-session",
			toolCallId: `draft-${Math.random().toString(36).slice(2, 8)}`,
			startedAt: new Date().toISOString(),
			finishedAt: new Date().toISOString(),
			stdoutFingerprint: "0".repeat(64),
			stderrFingerprint: "0".repeat(64),
			exitCode: 0,
		},
	};
	if (commandsRun.length > 0) {
		warnings.push("commandAudits are placeholders with exitCode 0 — they must reflect the real outcome of each command.");
	}
	warnings.push("the execution binding must match the run that actually produced this work.");

	const evidenceDir = join(getRunDir(repoRoot, runId), "..", "evidence");
	if (!existsSync(evidenceDir)) mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
	const draftPath = join(evidenceDir, `draft-${goalId ?? runId}.json`);
	writeFileSync(draftPath, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

	return { draftPath, envelope, warnings };
}
