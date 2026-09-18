import type { ExecutionBinding, StrictEvidenceEnvelope } from "./evidence-contract.js";
export interface ExecutionRecord {
    readonly workspaceRoot: string;
    readonly commandFingerprint: string;
    readonly binding: ExecutionBinding;
}
export declare function executionCommand(command: string, args: readonly string[]): string;
export declare function persistExecutionRecord(record: ExecutionRecord): void;
export declare function verifyExecutionRecords(repoRoot: string, evidence: StrictEvidenceEnvelope): string[];
