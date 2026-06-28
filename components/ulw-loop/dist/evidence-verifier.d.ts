import type { Stats } from "node:fs";
type PhysicalEvidenceFreshness = {
    readonly createdAgeInMs: number | null;
    readonly modifiedAgeInMs: number;
};
export declare function physicalEvidenceFreshness(stats: Pick<Stats, "birthtimeMs" | "mtimeMs">, referenceTimeMs: number): PhysicalEvidenceFreshness;
export declare function verifyPhysicalEvidenceFile(repoRoot: string, evidenceStr: string): void;
export {};
