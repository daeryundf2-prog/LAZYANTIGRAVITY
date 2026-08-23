/**
 * Active Memory & Gotcha Search Engine
 * Provides structured query search and ranking across persistent facts.jsonl records.
 */
import type { FactRecord } from "./store.js";
export interface MemorySearchResult {
    readonly query: string;
    readonly totalFacts: number;
    readonly matchedFacts: readonly FactRecord[];
}
export declare function searchMemoryFacts(cwd: string | undefined, query: string, category?: FactRecord["category"]): MemorySearchResult;
