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
export declare function saveFact(content: string, category?: FactRecord["category"], filePath?: string, metadata?: FactMetadata): FactRecord | null;
export declare function formatActiveMemoryContext(facts: FactRecord[]): string;
