export type UlwLimitErrorType = "context_window_exceeded" | "output_token_limit" | "model_rate_limited" | "account_quota_exceeded" | "provider_unavailable" | "unknown_model_error";
export interface UlwRoleCheckpoint {
    readonly taskId: string;
    readonly platform: "Antigravity" | "Codex";
    readonly selectedModel: string;
    readonly completedRoles: readonly string[];
    readonly currentRole: string;
    readonly failedRole?: string;
    readonly errorType?: UlwLimitErrorType;
    readonly filesChanged: readonly string[];
    readonly commandsRun: readonly string[];
    readonly artifactsGenerated: readonly string[];
    readonly nextRecommendedAction: string;
    readonly userResumeCommand: string;
    readonly internalResumeCommand: string;
    readonly timestamp: string;
    readonly dryRun?: boolean;
}
export declare function saveRoleCheckpoint(repoRoot: string, data: Omit<UlwRoleCheckpoint, "timestamp">): Promise<string>;
export declare function findLatestRoleCheckpoint(repoRoot: string): Promise<UlwRoleCheckpoint | null>;
