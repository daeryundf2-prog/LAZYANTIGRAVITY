export interface ToolPolicyResult {
    readonly allowed: boolean;
    readonly reason?: string;
}
export declare function validateToolInvocation(toolName: string, toolInput: unknown): ToolPolicyResult;
