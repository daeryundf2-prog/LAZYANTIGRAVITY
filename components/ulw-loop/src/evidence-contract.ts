/**
 * Strict Evidence Verification Contract
 * Prevents automated completion on unverified, partial, or inferred evidence.
 */

export type EvidenceStatus = "verified" | "partial" | "not_checked" | "inference";

export interface EvidenceRange {
	readonly file: string;
	readonly startLine?: number;
	readonly endLine?: number;
}

export interface StrictEvidenceEnvelope {
	readonly status: EvidenceStatus;
	readonly summary: string;
	readonly readRanges?: readonly EvidenceRange[];
	readonly unreadRanges?: readonly EvidenceRange[];
	readonly unknowns?: readonly string[];
	readonly inferences?: readonly string[];
	readonly filesChanged?: readonly string[];
	readonly commandsRun?: readonly string[];
	readonly dryRunSafety?: boolean;
}

export interface EvidenceValidationResult {
	readonly valid: boolean;
	readonly error?: string;
	readonly envelope?: StrictEvidenceEnvelope;
}

export function isStrictEvidenceStatus(status: unknown): status is EvidenceStatus {
	return status === "verified" || status === "partial" || status === "not_checked" || status === "inference";
}

export function validateStrictEvidence(evidence: unknown): EvidenceValidationResult {
	if (!evidence || typeof evidence !== "object") {
		return { valid: false, error: "Evidence must be an object." };
	}

	const raw = evidence as Record<string, unknown>;
	const status = raw["status"] as EvidenceStatus | undefined;

	if (!status || !isStrictEvidenceStatus(status)) {
		return {
			valid: false,
			error: `Invalid evidence status: "${status}". Must be one of: verified, partial, not_checked, inference.`,
		};
	}

	const summary = typeof raw["summary"] === "string" ? raw["summary"].trim() : "";
	if (!summary) {
		return { valid: false, error: "Evidence summary is required and cannot be empty." };
	}

	const unreadRanges = Array.isArray(raw["unreadRanges"]) ? raw["unreadRanges"] : [];
	const unknowns = Array.isArray(raw["unknowns"])
		? raw["unknowns"].filter((u) => typeof u === "string" && u.trim().length > 0)
		: [];
	const inferences = Array.isArray(raw["inferences"])
		? raw["inferences"].filter((i) => typeof i === "string" && i.trim().length > 0)
		: [];

	// Rule 1: 'verified' evidence must NOT contain any unread ranges, unknowns, or inferences
	if (status === "verified") {
		if (unreadRanges.length > 0) {
			return {
				valid: false,
				error: `Evidence marked as 'verified' cannot contain unreadRanges (${unreadRanges.length} found). Mark as 'partial' instead.`,
			};
		}
		if (unknowns.length > 0) {
			return {
				valid: false,
				error: `Evidence marked as 'verified' cannot contain unknowns (${unknowns.length} found). Mark as 'partial' or resolve unknowns.`,
			};
		}
		if (inferences.length > 0) {
			return {
				valid: false,
				error: `Evidence marked as 'verified' cannot contain inferences (${inferences.length} found). Mark as 'inference' or verify factually.`,
			};
		}
	}

	// Rule 2: 'partial', 'not_checked', 'inference' evidence MUST explicitly document gaps
	if (status === "partial" || status === "not_checked" || status === "inference") {
		const hasGapsDocumented = unreadRanges.length > 0 || unknowns.length > 0 || inferences.length > 0;
		if (!hasGapsDocumented) {
			return {
				valid: false,
				error: `Evidence marked as '${status}' must explicitly document at least one unreadRange, unknown, or inference gap.`,
			};
		}
	}

	const envelope: StrictEvidenceEnvelope = {
		status,
		summary,
		readRanges: Array.isArray(raw["readRanges"]) ? (raw["readRanges"] as EvidenceRange[]) : [],
		unreadRanges: unreadRanges as EvidenceRange[],
		unknowns,
		inferences,
		filesChanged: Array.isArray(raw["filesChanged"]) ? (raw["filesChanged"] as string[]) : [],
		commandsRun: Array.isArray(raw["commandsRun"]) ? (raw["commandsRun"] as string[]) : [],
		dryRunSafety: Boolean(raw["dryRunSafety"]),
	};

	return { valid: true, envelope };
}
