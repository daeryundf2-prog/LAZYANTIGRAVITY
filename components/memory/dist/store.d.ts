export interface FactRecord {
    id: string;
    timestamp: number;
    category: "fact" | "preference" | "gotcha" | "rule";
    content: string;
}
export declare function getMemoryFilePath(cwd?: string): string;
export declare function readFacts(filePath?: string): FactRecord[];
export declare function saveFact(content: string, category?: FactRecord["category"], filePath?: string): FactRecord | null;
export declare function formatActiveMemoryContext(facts: FactRecord[]): string;
