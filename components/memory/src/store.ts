import {
	appendFileSync,
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;

export interface FactRecord {
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
			if (
				typeof err === "object" &&
				err !== null &&
				"code" in err &&
				(err as { code: string }).code === "EEXIST"
			) {
				if (Date.now() > deadline) {
					return fn();
				}
				sleepSync(LOCK_RETRY_MS);
				continue;
			}
			return fn();
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
					});
				}
			} catch {}
		}
	} catch {}
	return facts;
}

export function saveFact(
	content: string,
	category: FactRecord["category"] = "fact",
	filePath?: string,
): FactRecord | null {
	const trimmed = content.trim();
	if (trimmed.length === 0) return null;

	const path = filePath ?? getMemoryFilePath();
	return withFileLock(path, () => {
		const existing = readFacts(path);

		// Deduplication check
		const isDuplicate = existing.some(
			(f) => f.content.toLowerCase() === trimmed.toLowerCase(),
		);
		if (isDuplicate) return null;

		const record: FactRecord = {
			id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			timestamp: Date.now(),
			category,
			content: trimmed,
		};

		appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
		return record;
	});
}

export function formatActiveMemoryContext(facts: FactRecord[]): string {
	if (facts.length === 0) return "";

	const lines = [
		"<project-active-memory>",
		"# Persistent Project Facts & Working Memory",
		"These verified project facts, conventions, and architectural gotchas were preserved across previous sessions:",
	];

	for (const fact of facts.slice(-20)) {
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
