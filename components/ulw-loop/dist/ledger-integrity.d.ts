export type LedgerVerificationResult = {
    readonly valid: boolean;
    readonly eventCount: number;
    readonly brokenIndex?: number;
    readonly expectedHash?: string;
    readonly actualHash?: string;
};
export declare function verifyLedgerIntegrity(repoRoot: string, runId: string): Promise<LedgerVerificationResult>;
