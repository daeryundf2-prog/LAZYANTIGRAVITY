import { type FactMetadata } from "./metadata.js";
export type { FactMetadata, FactReview } from "./metadata.js";
export interface FactRecord extends FactMetadata {
    verificationStatus?: "unverified";
    id: string;
    timestamp: number;
    category: "fact" | "preference" | "gotcha" | "rule";
    content: string;
}
export declare function getMemoryFilePath(cwd?: string): string;
export declare function readFacts(filePath?: string): FactRecord[];
export declare function detectSecret(text: string): string | null;
export declare function saveFact(content: string, category?: FactRecord["category"], filePath?: string, metadata?: FactMetadata): FactRecord | null;
/**
 * Pick what fits the injection budget: preferences, then rules, then gotchas,
 * then facts, newest first within a category. A fixed "last 20" dropped old
 * preferences that still applied. Selected facts keep their original order.
 */
export declare function selectFactsWithinBudget(facts: FactRecord[], budgetBytes: number): FactRecord[];
export declare function formatActiveMemoryContext(facts: FactRecord[]): string;
