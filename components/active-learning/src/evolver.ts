import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { extractFailurePatterns, readFailureEvents } from "./analyzer.js";
import type { ActiveLearningReport, LearnedGotcha } from "./types.js";

export interface EvolveOptions {
	readonly approve?: boolean;
	readonly evidenceJson?: string | Record<string, unknown>;
}

export function getMemoryPath(cwd: string = process.cwd()): string {
	const omoPath = join(cwd, ".omo", "memory");
	const lazyPath = join(cwd, ".lazyantigravity", "memory");
	if (existsSync(omoPath)) return join(omoPath, "facts.jsonl");
	if (!existsSync(lazyPath)) mkdirSync(lazyPath, { recursive: true, mode: 0o700 });
	return join(lazyPath, "facts.jsonl");
}

function resolveEvidenceInput(evidenceInput: string | Record<string, unknown>, cwd: string): Record<string, unknown> {
	if (typeof evidenceInput !== "string") return evidenceInput;
	const candidatePath = resolve(cwd, evidenceInput);
	const raw = existsSync(candidatePath) ? readFileSync(candidatePath, "utf8") : evidenceInput;
	const parsed: unknown = JSON.parse(raw);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Evidence must be a JSON object");
	return parsed as Record<string, unknown>;
}

function verifyDiskFilesAndHashes(raw: Record<string, unknown>, cwd: string): string | null {
	const readRanges = raw["readRanges"];
	const fileChecksums = raw["fileChecksums"];
	if (!Array.isArray(readRanges) || readRanges.length === 0) return "Evidence must contain readRanges";
	if (!Array.isArray(fileChecksums) || fileChecksums.length === 0) return "Evidence must contain fileChecksums";
	if (!Array.isArray(raw["commandAudits"]) || raw["commandAudits"].length === 0) return "Evidence must contain commandAudits";
	if (!Array.isArray(raw["commandsRun"]) || raw["commandsRun"].length === 0) return "Evidence must contain commandsRun";
	if (typeof raw["workspaceFingerprint"] !== "string" || raw["workspaceFingerprint"].trim() === "") return "Evidence must contain workspaceFingerprint";
	if (typeof raw["branch"] !== "string" || raw["branch"].trim() === "") return "Evidence must contain branch";
	if (typeof raw["workspaceBinding"] !== "string" || raw["workspaceBinding"].trim() === "") return "Evidence must contain workspaceBinding";
	let currentBranch = "";
	try { currentBranch = execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" }).trim(); } catch { return "Unable to determine current Git branch"; }
	if (!currentBranch || currentBranch !== raw["branch"]) return `Evidence branch does not match current branch (${currentBranch || "detached"})`;
	const expectedBinding = createHash("sha256").update(`${currentBranch}:${raw["workspaceFingerprint"]}`, "utf8").digest("hex");
	if (expectedBinding !== raw["workspaceBinding"]) return "Evidence workspaceBinding does not match current branch and workspace fingerprint";
	if (typeof raw["source"] !== "string" || raw["source"].trim() === "") return "Evidence must contain source";
	const binding = raw["executionBinding"];
	if (!binding || typeof binding !== "object" || Array.isArray(binding)) return "Evidence must contain executionBinding";
	const bindingRecord = binding as Record<string, unknown>;
	for (const key of ["requestId", "runId", "sessionId", "toolCallId", "startedAt", "finishedAt", "stdoutFingerprint", "stderrFingerprint"]) {
		if (typeof bindingRecord[key] !== "string" || (bindingRecord[key] as string).trim() === "") return `Evidence executionBinding missing ${key}`;
	}
	if (bindingRecord["exitCode"] !== 0) return "Evidence executionBinding must have exitCode 0";

	const root = resolve(cwd);
	const isInsideRoot = (path: string): boolean => {
		const rel = relative(root, resolve(path));
		return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
	};
	for (const range of readRanges) {
		if (!range || typeof range !== "object" || typeof range["file"] !== "string") return "Invalid readRanges entry";
		const file = isAbsolute(range["file"]) ? resolve(range["file"]) : resolve(root, range["file"]);
		if (!isInsideRoot(file) || !existsSync(file)) return `Referenced file in readRanges is invalid: ${range["file"]}`;
	}
	for (const item of fileChecksums) {
		if (!item || typeof item !== "object" || typeof item["file"] !== "string" || typeof item["sha256"] !== "string") return "Invalid fileChecksums entry";
		const file = isAbsolute(item["file"]) ? resolve(item["file"]) : resolve(root, item["file"]);
		if (!isInsideRoot(file) || !existsSync(file)) return `Checksum file is invalid: ${item["file"]}`;
		const actualSha = createHash("sha256").update(readFileSync(file)).digest("hex");
		if (actualSha !== item["sha256"].trim().toLowerCase()) return `SHA-256 mismatch for ${item["file"]}`;
	}
	for (const audit of raw["commandAudits"] as unknown[]) {
		if (!audit || typeof audit !== "object") return "Invalid command audit entry";
		const record = audit as Record<string, unknown>;
		if (typeof record["command"] !== "string" || record["exitCode"] !== 0) return "Every command audit must have exitCode 0";
	}
	return null;
}

function parseAndValidateEvidence(evidenceInput: string | Record<string, unknown>, cwd: string): { valid: boolean; summary: string; raw?: Record<string, unknown>; error?: string } {
	try {
		const raw = resolveEvidenceInput(evidenceInput, cwd);
		if (raw["status"] !== "verified") return { valid: false, summary: "", error: `Evidence status must be 'verified' (received '${String(raw["status"])}')` };
		const gaps = ["unknowns", "inferences", "unreadRanges"].filter((key) => Array.isArray(raw[key]) && raw[key].length > 0);
		if (gaps.length > 0) return { valid: false, summary: "", error: `Verified evidence contains gaps: ${gaps.join(", ")}` };
		const diskMismatch = verifyDiskFilesAndHashes(raw, cwd);
		if (diskMismatch) return { valid: false, summary: "", error: diskMismatch };
		return { valid: true, summary: typeof raw["summary"] === "string" && raw["summary"].trim() !== "" ? raw["summary"].trim() : "Verified active learning evidence", raw };
	} catch (error) {
		return { valid: false, summary: "", error: error instanceof Error ? error.message : String(error) };
	}
}

function sanitizeCandidate(value: string): string | null {
	const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
	if (normalized.length < 8 || normalized.length > 500) return null;
	if (/^(ignore|disregard|forget)\s+(all|any|previous|prior)/i.test(normalized)) return null;
	return normalized;
}

export function evolveRules(cwd: string = process.cwd(), options: EvolveOptions = {}): ActiveLearningReport {
	const events = readFailureEvents(cwd);
	const gotchas = extractFailurePatterns(events);
	const memoryFile = getMemoryPath(cwd);
	let existingContent = "";
	try { if (existsSync(memoryFile)) existingContent = readFileSync(memoryFile, "utf8"); } catch {}
	const promoted: LearnedGotcha[] = [];
	const shouldPromote = options.approve === true && options.evidenceJson !== undefined;
	if (!shouldPromote) return { analyzedEvents: events.length, identifiedPatterns: gotchas.length, promotedGotchas: [] };

	const validation = parseAndValidateEvidence(options.evidenceJson, cwd);
	if (!validation.valid || validation.raw === undefined) throw new Error(`Active-learning memory promotion rejected: ${validation.error}`);
	for (const gotcha of gotchas) {
		const safeRule = sanitizeCandidate(gotcha.suggestedRule);
		if (gotcha.confidence < 0.7 || safeRule === null || existingContent.includes(safeRule)) continue;
		const factRecord = {
			id: gotcha.id,
			timestamp: Date.now(),
			category: "gotcha",
			source: validation.raw["source"],
			evidenceStatus: "verified",
			evidenceSummary: validation.summary,
			workspaceFingerprint: validation.raw["workspaceFingerprint"],
			fileChecksums: validation.raw["fileChecksums"],
			commandAudits: validation.raw["commandAudits"],
			executionBinding: validation.raw["executionBinding"],
			content: `[자가학습 데이터·사용자 승인됨] ${safeRule}`,
		};
		appendFileSync(memoryFile, `${JSON.stringify(factRecord)}\n`, { encoding: "utf8", mode: 0o600 });
		promoted.push(gotcha);
		existingContent += `${safeRule}\n`;
	}
	return { analyzedEvents: events.length, identifiedPatterns: gotchas.length, promotedGotchas: promoted };
}
