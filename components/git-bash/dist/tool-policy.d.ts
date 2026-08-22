export interface ToolPolicyResult {
    readonly allowed: boolean;
    readonly reason?: string;
}
type JsonSchema = {
    type: "object";
    required: readonly string[];
    properties: Record<string, {
        type: "string" | "number" | "boolean" | "object" | "array";
    }>;
    additionalProperties: boolean;
};
export declare function validateToolInvocation(toolName: string, toolInput: unknown): ToolPolicyResult;
export declare function getToolPolicySchema(toolName: string): JsonSchema | undefined;
export {};
