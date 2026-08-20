import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { extractFailurePatterns, readFailureEvents } from "./analyzer.js";
import type { ActiveLearningReport, LearnedGotcha } from "./types.js";

export interface EvolveOptions {
	readonly approve?: boolean;
	readonly evidenceJson?: string | Record<string, unknown>;
}

export function getMemoryPath(cwd: string = process.cwd()): string {
	const p1 = join(cwd, ".omo", "memory");
	const p2 = join(cwd, ".lazyantigravity", "memory");

	if (existsSync(p1)) return join(p1, "facts.jsonl");
	if (!existsSync(p2)) {
		mkdirSync(p2, { recursive: true });
	}
	return join(p2, "facts.jsonl");
}

function verifyDiskFilesAndHashes(raw: Record<string, unknown>, cwd: string): string | null {
	if (Array.isArray(raw["readRanges"])) {
		for (const range of raw["readRanges"]) {
			if (range && typeof range === "object" && typeof range["file"] === "string") {
				const filePath = isAbsolute(range["file"]) ? range["file"] : resolve(cwd, range["file"]);
				if (!existsSync(filePath)) {
					return `Referenced file in readRanges does not exist on disk: ${range["file"]}`;
				}
			}
		}
	}

	if (Array.isArray(raw["fileChecksums"])) {
		for (const item of raw["fileChecksums"]) {
			if (item && typeof item === "object" && typeof item["file"] === "string" && typeof item["sha256"] === "string") {
				const filePath = isAbsolute(item["file"]) ? item["file"] : resolve(cwd, item["file"]);
				if (!existsSync(filePath)) {
					return `Checksum file does not exist: ${item["file"]}`;
				}
				const actualSha = createHash("sha256").update(readFileSync(filePath)).digest("hex");
				if (actualSha !== item["sha256"].trim().toLowerCase()) {
					return `SHA-256 mismatch for ${item["file"]}: expected ${item["sha256"]}, got ${actualSha}`;
				}
			}
		}
	}
	return null;
}

function parseAndValidateEvidence(evidenceInput: string | Record<string, unknown>, cwd: string): {
	valid: boolean;
	summary: string;
	error?: string;
} {
	let raw: Record<string, unknown>;
	if (typeof evidenceInput === "string") {
		try {
			const resolvedPath = resolve(cwd, evidenceInput);
			if (existsSync(resolvedPath)) {
				raw = JSON.parse(readFileSync(resolvedPath, "utf8"));
			} else {
				raw = JSON.parse(evidenceInput);
			}
		} catch {
			return { valid: false, summary: "", error: "Invalid evidence JSON or file not found" };
		}
	} else {
		raw = evidenceInput;
	}

	const status = raw["status"];
	if (status !== "verified") {
		return {
			valid: false,
			summary: "",
			error: `Evidence status must be 'verified' (received '${status}'). Inferred or partial evidence cannot promote facts.`,
		};
	}

	const unknowns = Array.isArray(raw["unknowns"]) ? raw["unknowns"] : [];
	const inferences = Array.isArray(raw["inferences"]) ? raw["inferences"] : [];
	const unreadRanges = Array.isArray(raw["unreadRanges"]) ? raw["unreadRanges"] : [];

	if (unknowns.length > 0 || inferences.length > 0 || unreadRanges.length > 0) {
		return {
			valid: false,
			summary: "",
			error: `Verified evidence must have zero unknowns, inferences, or unreadRanges (found ${unknowns.length} unknowns, ${inferences.length} inferences, ${unreadRanges.length} unreadRanges).`,
		};
	}

	const diskMismatch = verifyDiskFilesAndHashes(raw, cwd);
	if (diskMismatch) {
		return { valid: false, summary: "", error: diskMismatch };
	}

	const summary = typeof raw["summary"] === "string" ? raw["summary"].trim() : "Verified active learning evidence";
	return { valid: true, summary };
}

export function evolveRules(cwd: string = process.cwd(), options: EvolveOptions = {}): ActiveLearningReport {
	const events = readFailureEvents(cwd);
	const gotchas = extractFailurePatterns(events);
	const memoryFile = getMemoryPath(cwd);

	let existingContent = "";
	if (existsSync(memoryFile)) {
		try {
			existingContent = readFileSync(memoryFile, "utf8");
		} catch {}
	}

	const promoted: LearnedGotcha[] = [];
	const shouldPromote = options.approve !== false;

	if (shouldPromote) {
		let evidenceSummary = "Verified telemetry cluster evolution";
		if (options.evidenceJson) {
			const validation = parseAndValidateEvidence(options.evidenceJson, cwd);
			if (!validation.valid) {
				throw new Error(`Active-learning memory promotion rejected: ${validation.error}`);
			}
			evidenceSummary = validation.summary;
		}

		for (const g of gotchas) {
			if (g.confidence >= 0.7 && !existingContent.includes(g.pattern)) {
				const factRecord = {
					id: g.id,
					timestamp: Date.now(),
					category: "gotcha",
					source: "active-learning",
					evidenceStatus: "verified",
					evidenceSummary,
					content: `[자가학습 Gotcha] ${g.suggestedRule}`,
				};
				appendFileSync(memoryFile, `${JSON.stringify(factRecord)}\n`, "utf8");
				promoted.push(g);
			}
		}
	}

	return {
		analyzedEvents: events.length,
		identifiedPatterns: gotchas.length,
		promotedGotchas: promoted,
	};
}
