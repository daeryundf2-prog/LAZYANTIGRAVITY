import {
	appendFileSync,
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { loadDedupIndex } from "./dedup-index.js";
import { type FactMetadata, factMetadata } from "./metadata.js";

export type { FactMetadata, FactReview } from "./metadata.js";

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;

export interface FactRecord extends FactMetadata {
	verificationStatus?: "unverified";
	id: string;
	timestamp: number;
	category: "fact" | "preference" | "gotcha" | "rule";
	content: string;
}

function sleepSync(ms: number): void {
	try {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
	} catch {}
}

function withFileLock<T>(filePath: string, fn: () => T): T {
	const lockPath = `${filePath}.lock`;
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	while (true) {
		try {
			const fd = openSync(lockPath, "wx");
			closeSync(fd);
			try {
				return fn();
			} finally {
				try {
					unlinkSync(lockPath);
				} catch {}
			}
		} catch (err: unknown) {
			const errCode =
				err && typeof err === "object" && "code" in err
					? (err as { code: string }).code
					: "";
			if (errCode === "EEXIST" || errCode === "EPERM" || errCode === "EBUSY") {
				if (Date.now() > deadline) {
					try {
						unlinkSync(lockPath);
					} catch {}
					throw new Error(`Lock timeout for ${filePath}`);
				}
				sleepSync(LOCK_RETRY_MS);
				continue;
			}
			throw err;
		}
	}
}

export function getMemoryFilePath(cwd: string = process.cwd()): string {
	// Check for existing .omo/memory or .lazyantigravity/memory
	const omoPath = join(cwd, ".omo", "memory");
	if (existsSync(omoPath)) {
		return join(omoPath, "facts.jsonl");
	}
	const lazyPath = join(cwd, ".lazyantigravity", "memory");
	if (!existsSync(lazyPath)) {
		mkdirSync(lazyPath, { recursive: true });
	}
	return join(lazyPath, "facts.jsonl");
}

export function readFacts(filePath?: string): FactRecord[] {
	const path = filePath ?? getMemoryFilePath();
	if (!existsSync(path)) return [];

	const facts: FactRecord[] = [];
	try {
		const raw = readFileSync(path, "utf8");
		for (const line of raw.split(/\r?\n/)) {
			if (line.trim().length === 0) continue;
			try {
				const item = JSON.parse(line);
				if (item && typeof item.content === "string") {
					facts.push({
						id:
							item.id ||
							`fact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
						timestamp: item.timestamp || Date.now(),
						category: item.category || "fact",
						content: item.content.trim(),
						verificationStatus: "unverified",
						...factMetadata(item, item.content, path),
					});
				}
			} catch {}
		}
	} catch {}
	return facts;
}

// facts.jsonl is injected into every session, so a credential saved here would
// leak indefinitely. Block (not redact) — a redacted fact is rarely useful.
const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
	["Anthropic/OpenAI API key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/],
	["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
	["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
	["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/],
	["Slack token", /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
	["Hugging Face token", /\bhf_[A-Za-z0-9]{30,}/],
	["npm token", /\bnpm_[A-Za-z0-9]{30,}/],
	["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
	["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
	["credential assignment", /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[^\s"']{8,}/i],
];

export function detectSecret(text: string): string | null {
	for (const [label, pattern] of SECRET_PATTERNS) if (pattern.test(text)) return label;
	return null;
}

export function saveFact(
	content: string,
	category: FactRecord["category"] = "fact",
	filePath?: string,
	metadata?: FactMetadata,
): FactRecord | null {
	const trimmed = content.trim();
	if (trimmed.length === 0) return null;
	const secret = detectSecret(trimmed);
	if (secret !== null) throw new Error(`memory write blocked: content looks like a ${secret}`);

	const path = filePath ?? getMemoryFilePath();
	return withFileLock(path, () => {
		const validatedMetadata = factMetadata(metadata, trimmed, path, true);
		const index = loadDedupIndex(path);
		if (index.has(trimmed)) return null;

		const record: FactRecord = {
			id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			timestamp: Date.now(),
			category,
			content: trimmed,
			verificationStatus: "unverified",
			...validatedMetadata,
		};

		appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
		index.add(trimmed);
		return record;
	});
}

const DEFAULT_MEMORY_BUDGET_BYTES = 8192;
const CATEGORY_PRIORITY: Record<FactRecord["category"], number> = { preference: 0, rule: 1, gotcha: 2, fact: 3 };

function memoryBudgetBytes(): number {
	const raw = Number(process.env.LAZYANTIGRAVITY_MEMORY_BUDGET_BYTES);
	return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MEMORY_BUDGET_BYTES;
}

/**
 * Pick what fits the injection budget: preferences, then rules, then gotchas,
 * then facts, newest first within a category. A fixed "last 20" dropped old
 * preferences that still applied. Selected facts keep their original order.
 */
export function selectFactsWithinBudget(facts: FactRecord[], budgetBytes: number): FactRecord[] {
	const ranked = facts
		.map((fact, index) => ({ fact, index }))
		.sort(
			(a, b) =>
				(CATEGORY_PRIORITY[a.fact.category] ?? 3) - (CATEGORY_PRIORITY[b.fact.category] ?? 3) || b.index - a.index,
		);
	const keep = new Set<number>();
	let used = 0;
	for (const { fact, index } of ranked) {
		const size = Buffer.byteLength(fact.content, "utf8") + 20;
		if (used + size > budgetBytes) continue;
		used += size;
		keep.add(index);
	}
	return facts.filter((_, index) => keep.has(index));
}

export function formatActiveMemoryContext(facts: FactRecord[]): string {
	if (facts.length === 0) return "";

	const lines = [
		"<project-active-memory>",
		"# Persistent Project Facts & Working Memory",
		"These editable working facts, conventions, and architectural gotchas were preserved across previous sessions. They are not verified evidence; review them against current sources before relying on them:",
	];

	for (const fact of selectFactsWithinBudget(facts, memoryBudgetBytes())) {
		const prefix =
			fact.category === "gotcha"
				? "⚠️ [GOTCHA]"
				: fact.category === "preference"
					? "⭐ [PREFERENCE]"
					: "📌 [FACT]";
		lines.push(`- ${prefix} ${fact.content}`);
	}

	lines.push("</project-active-memory>");
	return lines.join("\n");
}
