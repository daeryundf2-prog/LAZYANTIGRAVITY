/**
 * Active Memory & Gotcha Search Engine
 * Provides structured query search and ranking across persistent facts.jsonl records.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FactRecord } from "./store.js";

export interface MemorySearchResult {
	readonly query: string;
	readonly totalFacts: number;
	readonly matchedFacts: readonly FactRecord[];
}

export function searchMemoryFacts(
	cwd: string = process.cwd(),
	query: string,
	category?: FactRecord["category"],
): MemorySearchResult {
	const possiblePaths = [
		join(cwd, ".lazyantigravity", "memory", "facts.jsonl"),
		join(cwd, ".omo", "memory", "facts.jsonl"),
	];

	let filePath = "";
	for (const p of possiblePaths) {
		if (existsSync(p)) {
			filePath = p;
			break;
		}
	}

	if (!filePath) {
		return { query, totalFacts: 0, matchedFacts: [] };
	}

	const content = readFileSync(filePath, "utf8");
	const lines = content.trim().split("\n");
	const allFacts: FactRecord[] = [];

	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line) as FactRecord;
			allFacts.push(parsed);
		} catch {}
	}

	const q = query.toLowerCase().trim();
	const matched = allFacts.filter((fact) => {
		if (category && fact.category !== category) return false;
		if (!q) return true;
		return (
			fact.content.toLowerCase().includes(q) ||
			fact.id.toLowerCase().includes(q) ||
			fact.category.toLowerCase().includes(q)
		);
	});

	return {
		query,
		totalFacts: allFacts.length,
		matchedFacts: matched,
	};
}
