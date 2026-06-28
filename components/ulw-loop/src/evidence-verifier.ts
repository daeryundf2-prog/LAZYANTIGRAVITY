import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { UlwLoopError } from "./types.js";

const PHYSICAL_EVIDENCE_MAX_AGE_MS = 30000;

function physicalEvidenceReferenceTimeMs(repoRoot: string): number {
	const anchorDir = join(repoRoot, ".omo", "ulw-loop");
	mkdirSync(anchorDir, { recursive: true });
	const anchorPath = join(anchorDir, ".evidence-clock-anchor");
	writeFileSync(anchorPath, `${Date.now()}\n`);
	return statSync(anchorPath).mtimeMs;
}

function removeZeroFailurePhrases(content: string): string {
	return content
		.replace(/\bno[ \t]+(?:tests?[ \t]+)?(?:failures?|errors?)[ \t]+found\b/g, "")
		.replace(/\b0[ \t]+(?:tests?[ \t]+)?(?:fail(?:ed|s|ures?)?|errors?)\b/g, "")
		.replace(/\b(?:fail(?:ed|s|count|ure|ures)?|error|errors)[ \t]*[:=]?[ \t]*0\b/g, "")
		.replace(/\b(?:failure|error)[ \t]+count[ \t]*[:=]?[ \t]*0\b/g, "");
}

export function verifyPhysicalEvidenceFile(repoRoot: string, evidenceStr: string): void {
	const fileMatch = evidenceStr.match(/file:\/\/(?:localhost)?(\/[a-zA-Z0-9_\-./]+|[a-zA-Z]:\\[a-zA-Z0-9_\-.\\ ]+)/i);
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
		throw new UlwLoopError(`Physical evidence file not found: ${rawPath}.`, "ULW_LOOP_EVIDENCE_FILE_NOT_FOUND", {
			details: { path: absolutePath },
		});
	}

	const stats = statSync(absolutePath);
	const ageInMs = physicalEvidenceReferenceTimeMs(repoRoot) - stats.mtimeMs;
	if (ageInMs > PHYSICAL_EVIDENCE_MAX_AGE_MS) {
		throw new UlwLoopError(
			`Physical evidence file is outdated (modified ${Math.round(ageInMs / 1000)}s ago, must be < 30s): ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_OUTDATED",
			{ details: { path: absolutePath, ageInMs } },
		);
	}

	try {
		const content = readFileSync(absolutePath, "utf8").toLowerCase();
		const failureKeywords = ["fail", "error", "exception", "failed", "unhandledrejection", "rejected"];

		const cleanedContent = removeZeroFailurePhrases(content);
		for (const keyword of failureKeywords) {
			if (cleanedContent.includes(keyword)) {
				throw new UlwLoopError(
					`Physical evidence file contains error/failure keyword: "${keyword}".`,
					"ULW_LOOP_EVIDENCE_FILE_CONTAINS_ERRORS",
					{ details: { path: absolutePath, keyword } },
				);
			}
		}
	} catch (err) {
		if (err instanceof UlwLoopError) throw err;
		throw new UlwLoopError(
			`Failed to read physical evidence file: ${err instanceof Error ? err.message : String(err)}`,
			"ULW_LOOP_EVIDENCE_FILE_READ_FAILED",
			{ details: { path: absolutePath } },
		);
	}
}
