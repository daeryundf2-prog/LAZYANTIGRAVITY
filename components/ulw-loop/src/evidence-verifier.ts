import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { UlwLoopError } from "./types.js";

const PHYSICAL_EVIDENCE_MAX_AGE_MS = 30000;
const FAILURE_KEYWORDS = ["fail", "error", "exception", "failed", "unhandledrejection", "rejected"] as const;

type PhysicalEvidenceFreshness = {
	readonly createdAgeInMs: number | null;
	readonly modifiedAgeInMs: number;
};

function physicalEvidenceReferenceTimeMs(repoRoot: string): number {
	const anchorDir = join(repoRoot, ".omo", "ulw-loop");
	mkdirSync(anchorDir, { recursive: true });
	const anchorPath = join(anchorDir, `.evidence-clock-anchor-${process.pid}-${randomUUID()}`);
	try {
		writeFileSync(anchorPath, `${Date.now()}\n`);
		return statSync(anchorPath).mtimeMs;
	} finally {
		rmSync(anchorPath, { force: true });
	}
}

function removeZeroFailurePhrases(content: string): string {
	return content
		.replace(/\bno[ \t]+(?:tests?[ \t]+)?(?:failures?|errors?)[ \t]+found\b/g, "")
		.replace(/\b0[ \t]+(?:tests?[ \t]+)?(?:fail(?:ed|s|ures?)?|errors?)\b/g, "")
		.replace(/\b(?:fail(?:ed|s|count|ure|ures)?|error|errors)[ \t]*[:=]?[ \t]*0\b/g, "")
		.replace(/\b(?:failure|error)[ \t]+count[ \t]*[:=]?[ \t]*0\b/g, "");
}

function compactForObfuscationScan(content: string): string {
	return content
		.normalize("NFKC")
		.replace(/\x1b\[[0-9;]*m/g, "")
		.replace(/[^a-z0-9]/g, "");
}

function detectedFailureKeyword(content: string): (typeof FAILURE_KEYWORDS)[number] | null {
	const cleanedContent = removeZeroFailurePhrases(content);
	const compactedContent = compactForObfuscationScan(cleanedContent);
	for (const keyword of FAILURE_KEYWORDS) {
		if (cleanedContent.includes(keyword) || compactedContent.includes(keyword)) {
			return keyword;
		}
	}
	return null;
}

function evidenceDir(repoRoot: string): string {
	return resolve(repoRoot, ".omo", "ulw-loop", "evidence");
}

function isInsideDir(parentDir: string, filePath: string): boolean {
	const rel = relative(parentDir, filePath);
	return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

function extractPhysicalEvidencePath(evidenceStr: string): string | null {
	const fileUrlIndex = evidenceStr.search(/\bfile:\/\//i);
	if (fileUrlIndex < 0) {
		return null;
	}
	const fileUrlAndTail = evidenceStr.slice(fileUrlIndex);
	const cleanupSeparator = fileUrlAndTail.match(/\s+\|\s+/);
	const fileUrl =
		cleanupSeparator?.index === undefined
			? fileUrlAndTail.trim()
			: fileUrlAndTail.slice(0, cleanupSeparator.index).trim();
	return fileURLToPath(fileUrl);
}

export function physicalEvidenceFreshness(
	stats: Pick<Stats, "birthtimeMs" | "mtimeMs">,
	referenceTimeMs: number,
): PhysicalEvidenceFreshness {
	const createdAgeInMs =
		Number.isFinite(stats.birthtimeMs) && stats.birthtimeMs > 0 ? referenceTimeMs - stats.birthtimeMs : null;
	return {
		createdAgeInMs,
		modifiedAgeInMs: referenceTimeMs - stats.mtimeMs,
	};
}

export function verifyPhysicalEvidenceFile(repoRoot: string, evidenceStr: string): void {
	const rawPath = extractPhysicalEvidencePath(evidenceStr);
	if (rawPath === null) {
		throw new UlwLoopError(
			"Passing evidence must include a physical file:// artifact under .omo/ulw-loop/evidence.",
			"ULW_LOOP_EVIDENCE_FILE_REQUIRED",
		);
	}
	let cleanPath = rawPath;
	if (cleanPath.startsWith("///")) {
		cleanPath = cleanPath.slice(2);
	}
	let absolutePath = cleanPath;
	if (!isAbsolute(absolutePath)) {
		absolutePath = join(repoRoot, absolutePath);
	}
	absolutePath = resolve(absolutePath);

	if (!existsSync(absolutePath)) {
		throw new UlwLoopError(`Physical evidence file not found: ${rawPath}.`, "ULW_LOOP_EVIDENCE_FILE_NOT_FOUND", {
			details: { path: absolutePath },
		});
	}
	absolutePath = realpathSync(absolutePath);

	const allowedDirPath = evidenceDir(realpathSync(repoRoot));
	mkdirSync(allowedDirPath, { recursive: true });
	if (!isInsideDir(allowedDirPath, absolutePath)) {
		throw new UlwLoopError(
			`Physical evidence file must be inside .omo/ulw-loop/evidence: ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_PATH_OUTSIDE_ROOT",
			{ details: { path: absolutePath, evidenceDir: allowedDirPath } },
		);
	}

	const stats = statSync(absolutePath);
	const freshness = physicalEvidenceFreshness(stats, physicalEvidenceReferenceTimeMs(repoRoot));
	if (freshness.modifiedAgeInMs > PHYSICAL_EVIDENCE_MAX_AGE_MS) {
		throw new UlwLoopError(
			`Physical evidence file is outdated (modified ${Math.round(freshness.modifiedAgeInMs / 1000)}s ago, must be < 30s): ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_OUTDATED",
			{ details: { path: absolutePath, ageInMs: freshness.modifiedAgeInMs } },
		);
	}
	if (freshness.createdAgeInMs !== null && freshness.createdAgeInMs > PHYSICAL_EVIDENCE_MAX_AGE_MS) {
		throw new UlwLoopError(
			`Physical evidence file was not freshly created (created ${Math.round(freshness.createdAgeInMs / 1000)}s ago, must be < 30s): ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_NOT_FRESHLY_CREATED",
			{ details: { path: absolutePath, ageInMs: freshness.createdAgeInMs } },
		);
	}
	if (freshness.createdAgeInMs === null) {
		throw new UlwLoopError(
			`Physical evidence file creation time is unavailable; rerun the evidence command into a new artifact: ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_CREATION_TIME_UNAVAILABLE",
			{ details: { path: absolutePath } },
		);
	}

	try {
		const content = readFileSync(absolutePath, "utf8").toLowerCase();
		const keyword = detectedFailureKeyword(content);
		if (keyword !== null) {
			throw new UlwLoopError(
				`Physical evidence file contains error/failure keyword: "${keyword}".`,
				"ULW_LOOP_EVIDENCE_FILE_CONTAINS_ERRORS",
				{ details: { path: absolutePath, keyword } },
			);
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
