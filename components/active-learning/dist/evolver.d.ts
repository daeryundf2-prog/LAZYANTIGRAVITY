import type { ActiveLearningReport } from "./types.js";
export interface EvolveOptions {
    readonly approve?: boolean;
    readonly evidenceJson?: string | Record<string, unknown>;
}
export declare function getMemoryPath(cwd?: string): string;
export declare function evolveRules(cwd?: string, options?: EvolveOptions): ActiveLearningReport;
