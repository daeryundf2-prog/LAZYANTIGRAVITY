export type ClaimStatus = "VERIFIED" | "REFUTED" | "UNRESOLVED" | "INVALID";
export interface ClaimLedgerRow {
    readonly claimId: string;
    readonly claim: string;
    readonly riskLevel: string;
    readonly sources: string;
    readonly domains: readonly string[];
    readonly counterSearch: string;
    readonly primarySource: string;
    readonly status: ClaimStatus;
    readonly rawStatus: string;
    readonly violations: readonly string[];
}
export interface ResearchClaimsReport {
    readonly ok: boolean;
    readonly ledgerFile: string;
    readonly synthesisFile?: string;
    readonly totalClaims: number;
    readonly verifiedCount: number;
    readonly refutedCount: number;
    readonly unresolvedCount: number;
    readonly passCount: number;
    readonly failCount: number;
    readonly rows: readonly ClaimLedgerRow[];
    readonly violations: ReadonlyArray<{
        readonly claimId: string;
        readonly violation: string;
    }>;
}
export declare function validateClaimLedger(repoRoot: string, options: {
    ledgerFile: string;
    synthesisFile?: string;
}): Promise<ResearchClaimsReport>;
