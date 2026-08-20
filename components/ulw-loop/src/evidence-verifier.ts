import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { LedgerEvent } from "./control-plane-types.js";
import type { StrictEvidenceEnvelope } from "./evidence-contract.js";

export interface GroundTruthAuditResult {
	readonly verified: boolean;
	readonly error?: string;
	readonly mismatchedFiles?: readonly string[];
	readonly nonZeroExitCommands?: readonly string[];
	readonly invalidLineRanges?: readonly string[];
}

export function computeFileSha256(filePath: string): string | null {
	try {
		if (!existsSync(filePath)) return null;
		const content = readFileSync(filePath);
		return createHash("sha256").update(content).digest("hex");
	} catch {
		return null;
	}
}

export function countFileLines(filePath: string): number | null {
	try {
		if (!existsSync(filePath)) return null;
		const content = readFileSync(filePath, "utf8");
		return content.split("\n").length;
	} catch {
		return null;
	}
}

export function verifyEvidenceGroundTruth(
	repoRoot: string,
	evidence: StrictEvidenceEnvelope,
	events?: readonly LedgerEvent[],
): GroundTruthAuditResult {
	const mismatchedFiles: string[] = [];
	const invalidLineRanges: string[] = [];
	const nonZeroExitCommands: string[] = [];

	// 1. Verify readRanges against actual disk files and valid line numbers
	if (evidence.readRanges && evidence.readRanges.length > 0) {
		for (const range of evidence.readRanges) {
			const targetPath = isAbsolute(range.file) ? range.file : resolve(repoRoot, range.file);
			if (!existsSync(targetPath)) {
				mismatchedFiles.push(`Missing referenced file in readRanges: ${range.file}`);
				continue;
			}
			const totalLines = countFileLines(targetPath);
			if (totalLines !== null) {
				if (range.startLine !== undefined && (range.startLine < 1 || range.startLine > totalLines)) {
					invalidLineRanges.push(
						`Invalid startLine ${range.startLine} for file ${range.file} (total lines: ${totalLines})`,
					);
				}
				if (range.endLine !== undefined && (range.endLine < 1 || range.endLine > totalLines)) {
					invalidLineRanges.push(
						`Invalid endLine ${range.endLine} for file ${range.file} (total lines: ${totalLines})`,
					);
				}
				if (range.startLine !== undefined && range.endLine !== undefined && range.startLine > range.endLine) {
					invalidLineRanges.push(
						`startLine ${range.startLine} exceeds endLine ${range.endLine} for file ${range.file}`,
					);
				}
			}
		}
	}

	// 2. Verify fileChecksums if provided against real disk SHA-256
	if (evidence.fileChecksums && evidence.fileChecksums.length > 0) {
		for (const checksum of evidence.fileChecksums) {
			const targetPath = isAbsolute(checksum.file) ? checksum.file : resolve(repoRoot, checksum.file);
			const actualSha = computeFileSha256(targetPath);
			if (!actualSha) {
				mismatchedFiles.push(`Cannot compute hash for missing file: ${checksum.file}`);
			} else if (actualSha !== checksum.sha256) {
				mismatchedFiles.push(
					`SHA-256 mismatch for ${checksum.file}: expected ${checksum.sha256}, got ${actualSha}`,
				);
			}
		}
	}

	// 3. Verify command execution audits (must be exitCode 0 if recorded)
	if (evidence.commandAudits && evidence.commandAudits.length > 0) {
		for (const audit of evidence.commandAudits) {
			if (audit.exitCode !== undefined && audit.exitCode !== 0) {
				nonZeroExitCommands.push(`Command "${audit.command}" exited with non-zero code ${audit.exitCode}`);
			}
		}
	}

	// 4. Cross-check against ledger completed events if provided
	if (events && events.length > 0) {
		const completedEvent = events.find((e) => e.type === "agent.completed_reported");
		if (completedEvent?.result && typeof completedEvent.result === "object") {
			const subResult = completedEvent.result as Record<string, unknown>;
			const subCommands = Array.isArray(subResult["commandsRun"]) ? (subResult["commandsRun"] as string[]) : [];
			if (evidence.commandsRun && evidence.commandsRun.length > 0 && subCommands.length > 0) {
				const hasOverlap = evidence.commandsRun.some((cmd) => subCommands.includes(cmd));
				if (!hasOverlap && evidence.status === "verified") {
					nonZeroExitCommands.push(
						"Evidence commandsRun does not match any commands recorded in agent completed event",
					);
				}
			}
		}
	}

	const hasErrors = mismatchedFiles.length > 0 || invalidLineRanges.length > 0 || nonZeroExitCommands.length > 0;

	if (hasErrors) {
		const errorParts: string[] = [];
		if (mismatchedFiles.length > 0) errorParts.push(`Files: ${mismatchedFiles.join("; ")}`);
		if (invalidLineRanges.length > 0) errorParts.push(`Lines: ${invalidLineRanges.join("; ")}`);
		if (nonZeroExitCommands.length > 0) errorParts.push(`Commands: ${nonZeroExitCommands.join("; ")}`);
		return {
			verified: false,
			error: `Fabricated or inconsistent evidence detected: ${errorParts.join(" | ")}`,
			mismatchedFiles,
			invalidLineRanges,
			nonZeroExitCommands,
		};
	}

	return { verified: true };
}
