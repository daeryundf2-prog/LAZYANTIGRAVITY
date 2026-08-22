/**
 * Strict Evidence Verification Contract
 * Prevents automated completion on unverified, partial, or fabricated evidence.
 */

export type EvidenceStatus = "verified" | "partial" | "not_checked" | "inference";

export interface EvidenceRange {
	readonly file: string;
	readonly startLine?: number;
	readonly endLine?: number;
}

export interface FileChecksum {
	readonly file: string;
	readonly sha256: string;
}

export interface CommandExecutionAudit {
	readonly command: string;
	readonly exitCode?: number;
	readonly outputSnippet?: string;
}

export interface ExecutionBinding {
	readonly requestId: string;
	readonly runId: string;
	readonly sessionId: string;
	readonly toolCallId: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly exitCode: number;
	readonly stdoutFingerprint: string;
	readonly stderrFingerprint: string;
}

export interface StrictEvidenceEnvelope {
	readonly status: EvidenceStatus;
	readonly summary: string;
	readonly workspaceRoot?: string;
	readonly readRanges?: readonly EvidenceRange[];
	readonly unreadRanges?: readonly EvidenceRange[];
	readonly unknowns?: readonly string[];
	readonly inferences?: readonly string[];
	readonly filesChanged?: readonly string[];
	readonly fileChecksums?: readonly FileChecksum[];
	readonly commandsRun?: readonly string[];
	readonly commandAudits?: readonly CommandExecutionAudit[];
	readonly executionBinding?: ExecutionBinding;
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

function parseRanges(rawRanges: unknown): EvidenceRange[] {
	if (!Array.isArray(rawRanges)) return [];
	const result: EvidenceRange[] = [];
	for (const item of rawRanges) {
		if (item && typeof item === "object" && typeof (item as Record<string, unknown>)["file"] === "string") {
			const record = item as Record<string, unknown>;
			const file = (record["file"] as string).trim();
			const startLine = typeof record["startLine"] === "number" ? record["startLine"] : undefined;
			const endLine = typeof record["endLine"] === "number" ? record["endLine"] : undefined;
			result.push({
				file,
				...(startLine !== undefined ? { startLine } : {}),
				...(endLine !== undefined ? { endLine } : {}),
			});
		}
	}
	return result;
}

function parseChecksums(rawChecksums: unknown): FileChecksum[] {
	if (!Array.isArray(rawChecksums)) return [];
	const result: FileChecksum[] = [];
	for (const item of rawChecksums) {
		if (item && typeof item === "object" && typeof (item as Record<string, unknown>)["file"] === "string") {
			const record = item as Record<string, unknown>;
			const sha256 = typeof record["sha256"] === "string" ? record["sha256"].trim().toLowerCase() : "";
			if (sha256.length === 64) {
				result.push({ file: (record["file"] as string).trim(), sha256 });
			}
		}
	}
	return result;
}

function parseExecutionBinding(raw: unknown): ExecutionBinding | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const value = raw as Record<string, unknown>;
	const strings = ["requestId", "runId", "sessionId", "toolCallId", "startedAt", "finishedAt", "stdoutFingerprint", "stderrFingerprint"];
	if (!strings.every((key) => typeof value[key] === "string" && (value[key] as string).trim() !== "")) return undefined;
	if (typeof value["exitCode"] !== "number" || !Number.isInteger(value["exitCode"])) return undefined;
	return {
		requestId: value["requestId"] as string,
		runId: value["runId"] as string,
		sessionId: value["sessionId"] as string,
		toolCallId: value["toolCallId"] as string,
		startedAt: value["startedAt"] as string,
		finishedAt: value["finishedAt"] as string,
		exitCode: value["exitCode"] as number,
		stdoutFingerprint: value["stdoutFingerprint"] as string,
		stderrFingerprint: value["stderrFingerprint"] as string,
	};
}

function parseCommandAudits(rawAudits: unknown): CommandExecutionAudit[] {
	if (!Array.isArray(rawAudits)) return [];
	const result: CommandExecutionAudit[] = [];
	for (const item of rawAudits) {
		if (item && typeof item === "object" && typeof (item as Record<string, unknown>)["command"] === "string") {
			const record = item as Record<string, unknown>;
			const command = (record["command"] as string).trim();
			const exitCode = typeof record["exitCode"] === "number" ? record["exitCode"] : undefined;
			const outputSnippet = typeof record["outputSnippet"] === "string" ? record["outputSnippet"] : undefined;
			result.push({
				command,
				...(exitCode !== undefined ? { exitCode } : {}),
				...(outputSnippet !== undefined ? { outputSnippet } : {}),
			});
		}
	}
	return result;
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

	const readRanges = parseRanges(raw["readRanges"]);
	const unreadRanges = parseRanges(raw["unreadRanges"]);
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

	const executionBinding = parseExecutionBinding(raw["executionBinding"]);
	const envelope: StrictEvidenceEnvelope = {
		status,
		summary,
		...(typeof raw["workspaceRoot"] === "string" ? { workspaceRoot: raw["workspaceRoot"].trim() } : {}),
		readRanges,
		unreadRanges,
		unknowns,
		inferences,
		filesChanged: Array.isArray(raw["filesChanged"]) ? (raw["filesChanged"] as string[]) : [],
		fileChecksums: parseChecksums(raw["fileChecksums"]),
		commandsRun: Array.isArray(raw["commandsRun"]) ? (raw["commandsRun"] as string[]) : [],
		commandAudits: parseCommandAudits(raw["commandAudits"]),
		...(executionBinding !== undefined ? { executionBinding } : {}),
		dryRunSafety: Boolean(raw["dryRunSafety"]),
	};

	return { valid: true, envelope };
}
