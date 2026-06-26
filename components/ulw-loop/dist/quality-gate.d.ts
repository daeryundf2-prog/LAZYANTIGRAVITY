import type { UlwLoopQualityGate } from "./types.js";
export { classifyExternalAuthorizationBlocker, clearGoalBlockerFields, normalizeBlockerEvidence, sameBlockerOccurrences, } from "./quality-gate-blockers.js";
export interface QualityGateFs {
    readonly existsSync: (path: string) => boolean;
    readonly statSync: (path: string) => {
        readonly size: number;
    };
}
export interface ValidateQualityGateOptions {
    readonly repoRoot: string;
    readonly fs: QualityGateFs;
}
export declare function validateQualityGate(input: unknown, opts?: ValidateQualityGateOptions): UlwLoopQualityGate;
