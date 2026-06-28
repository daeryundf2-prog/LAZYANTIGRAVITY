import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileSha256Hex, parseTrustedEvidenceManifest } from "./evidence-manifest.js";
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

function trustedEvidencePath(repoRoot: string, rawPath: string, label: string): string {
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
		throw new UlwLoopError(`${label} not found: ${rawPath}.`, "ULW_LOOP_EVIDENCE_FILE_NOT_FOUND", {
			details: { path: absolutePath },
		});
	}
	const realPath = realpathSync(absolutePath);
	const allowedDirPath = evidenceDir(realpathSync(repoRoot));
	mkdirSync(allowedDirPath, { recursive: true });
	if (!isInsideDir(allowedDirPath, realPath)) {
		throw new UlwLoopError(
			`${label} must be inside .omo/ulw-loop/evidence: ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_PATH_OUTSIDE_ROOT",
			{
				details: { path: realPath, evidenceDir: allowedDirPath },
			},
		);
	}
	return realPath;
}

function assertFreshEvidenceFile(path: string, rawPath: string, referenceTimeMs: number, label: string): void {
	const stats = statSync(path);
	const freshness = physicalEvidenceFreshness(stats, referenceTimeMs);
	if (freshness.modifiedAgeInMs > PHYSICAL_EVIDENCE_MAX_AGE_MS) {
		throw new UlwLoopError(
			`${label} is outdated (modified ${Math.round(freshness.modifiedAgeInMs / 1000)}s ago, must be < 30s): ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_OUTDATED",
			{ details: { path, ageInMs: freshness.modifiedAgeInMs } },
		);
	}
	if (freshness.createdAgeInMs !== null && freshness.createdAgeInMs > PHYSICAL_EVIDENCE_MAX_AGE_MS) {
		throw new UlwLoopError(
			`${label} was not freshly created (created ${Math.round(freshness.createdAgeInMs / 1000)}s ago, must be < 30s): ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_NOT_FRESHLY_CREATED",
			{ details: { path, ageInMs: freshness.createdAgeInMs } },
		);
	}
	if (freshness.createdAgeInMs === null) {
		throw new UlwLoopError(
			`${label} creation time is unavailable; rerun the evidence command into a new artifact: ${rawPath}.`,
			"ULW_LOOP_EVIDENCE_FILE_CREATION_TIME_UNAVAILABLE",
			{ details: { path } },
		);
	}
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
			"Passing evidence must include a trusted capture manifest file:// artifact under .omo/ulw-loop/evidence.",
			"ULW_LOOP_EVIDENCE_FILE_REQUIRED",
		);
	}
	const referenceTimeMs = physicalEvidenceReferenceTimeMs(repoRoot);
	const manifestPath = trustedEvidencePath(repoRoot, rawPath, "Trusted evidence manifest");
	assertFreshEvidenceFile(manifestPath, rawPath, referenceTimeMs, "Trusted evidence manifest");
	try {
		const manifest = parseTrustedEvidenceManifest(readFileSync(manifestPath, "utf8"));
		if (manifest.exitCode !== 0) {
			throw new UlwLoopError(
				`Trusted evidence command exited with code ${manifest.exitCode}.`,
				"ULW_LOOP_EVIDENCE_COMMAND_FAILED",
				{ details: { path: manifestPath, exitCode: manifest.exitCode, command: manifest.command } },
			);
		}
		if (realpathSync(manifest.cwd) !== realpathSync(repoRoot)) {
			throw new UlwLoopError(
				"Trusted evidence manifest cwd does not match this repository.",
				"ULW_LOOP_EVIDENCE_MANIFEST_CWD_MISMATCH",
				{
					details: { path: manifestPath, cwd: manifest.cwd, repoRoot: realpathSync(repoRoot) },
				},
			);
		}
		const artifactPath = trustedEvidencePath(repoRoot, manifest.artifactPath, "Captured evidence artifact");
		assertFreshEvidenceFile(artifactPath, manifest.artifactPath, referenceTimeMs, "Captured evidence artifact");
		const actualHash = fileSha256Hex(artifactPath);
		if (actualHash !== manifest.artifactSha256) {
			throw new UlwLoopError(
				"Captured evidence artifact hash does not match its trusted manifest.",
				"ULW_LOOP_EVIDENCE_ARTIFACT_HASH_MISMATCH",
				{
					details: { path: artifactPath, expected: manifest.artifactSha256, actual: actualHash },
				},
			);
		}
		const content = readFileSync(artifactPath, "utf8").toLowerCase();
		const keyword = detectedFailureKeyword(content);
		if (keyword !== null) {
			throw new UlwLoopError(
				`Captured evidence artifact contains error/failure keyword: "${keyword}".`,
				"ULW_LOOP_EVIDENCE_FILE_CONTAINS_ERRORS",
				{ details: { path: artifactPath, keyword } },
			);
		}
	} catch (err) {
		if (err instanceof UlwLoopError) throw err;
		throw new UlwLoopError(
			`Failed to read trusted evidence manifest: ${err instanceof Error ? err.message : String(err)}`,
			"ULW_LOOP_EVIDENCE_FILE_READ_FAILED",
			{ details: { path: manifestPath } },
		);
	}
}
