import { existsSync, statSync, readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { UlwLoopError } from "./types.js";

export function verifyPhysicalEvidenceFile(repoRoot: string, evidenceStr: string): void {
	const fileMatch = evidenceStr.match(/file:\/\/(?:localhost)?(\/[a-zA-Z0-9_\-\.\/]+|[a-zA-Z]:\\[a-zA-Z0-9_\-\.\\ ]+)/i);
	if (!fileMatch) {
		return;
	}
	const rawPath = fileMatch[1];
	if (!rawPath) {
		return;
	}
	let cleanPath = rawPath;
	if (cleanPath.startsWith("///")) {
		cleanPath = cleanPath.slice(2);
	}
	let absolutePath = cleanPath;
	if (!isAbsolute(absolutePath)) {
		absolutePath = join(repoRoot, absolutePath);
	}

	if (!existsSync(absolutePath)) {
		throw new UlwLoopError(
			`Physical evidence file not found: ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_NOT_FOUND",
			{ details: { path: absolutePath } }
		);
	}

	const stats = statSync(absolutePath);
	const ageInMs = Date.now() - stats.mtimeMs;
	if (ageInMs > 30000) {
		throw new UlwLoopError(
			`Physical evidence file is outdated (modified ${Math.round(ageInMs / 1000)}s ago, must be < 30s): ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_OUTDATED",
			{ details: { path: absolutePath, ageInMs } }
		);
	}

	try {
		const content = readFileSync(absolutePath, "utf8").toLowerCase();
		const failureKeywords = ["fail", "error", "exception", "failed", "unhandledrejection", "rejected"];
		const zeroFailureRegex = /(?:\b(?:fail(?:ed|s|count|ure|ures)?|error|errors)\s*[:=]?\s*0\b|\b0\s*(?:fail(?:ed|s|count|ure|ures)?|error|errors)\b)/g;

		const cleanedContent = content.replace(zeroFailureRegex, "");
		for (const keyword of failureKeywords) {
			if (cleanedContent.includes(keyword)) {
				throw new UlwLoopError(
					`Physical evidence file contains error/failure keyword: "${keyword}".`,
					"ULW_LOOP_EVIDENCE_FILE_CONTAINS_ERRORS",
					{ details: { path: absolutePath, keyword } }
				);
			}
		}
	} catch (err) {
		if (err instanceof UlwLoopError) throw err;
		throw new UlwLoopError(
			`Failed to read physical evidence file: ${err instanceof Error ? err.message : String(err)}`,
			"ULW_LOOP_EVIDENCE_FILE_READ_FAILED",
			{ details: { path: absolutePath } }
		);
	}
}
