export interface ToolPolicyResult {
	readonly allowed: boolean;
	readonly reason?: string;
}

type JsonSchema = {
	type: "object";
	required: readonly string[];
	properties: Record<string, { type: "string" | "number" | "boolean" | "object" | "array" }>;
	additionalProperties: boolean;
};

const BLOCKED_COMMANDS = [
	/\brm\s+-rf\s+\/$/i,
	/\bgit\s+reset\s+--hard\b/i,
	/\bgit\s+clean\s+-[a-z]*f/i,
	/\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash|zsh)\b/i,
	/\bsudo\b/i,
];

const TOOL_SCHEMAS: Record<string, JsonSchema> = {
	Bash: { type: "object", required: ["command"], properties: { command: { type: "string" }, timeoutMs: { type: "number" }, cwd: { type: "string" } }, additionalProperties: false },
	Read: { type: "object", required: ["file_path"], properties: { file_path: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } }, additionalProperties: false },
	Write: { type: "object", required: ["file_path", "content"], properties: { file_path: { type: "string" }, content: { type: "string" } }, additionalProperties: false },
	Edit: { type: "object", required: ["file_path", "old_string", "new_string"], properties: { file_path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } }, additionalProperties: false },
	Glob: { type: "object", required: ["pattern"], properties: { pattern: { type: "string" }, path: { type: "string" } }, additionalProperties: false },
	Grep: { type: "object", required: ["pattern"], properties: { pattern: { type: "string" }, path: { type: "string" }, include: { type: "string" } }, additionalProperties: false },
};

function matchesSchema(input: unknown, schema: JsonSchema): string | undefined {
	if (!input || typeof input !== "object" || Array.isArray(input)) return "Tool input must be an object.";
	const value = input as Record<string, unknown>;
	for (const key of schema.required) if (!(key in value)) return `Missing required tool argument: ${key}`;
	if (!schema.additionalProperties) for (const key of Object.keys(value)) if (!(key in schema.properties)) return `Unknown tool argument: ${key}`;
	for (const [key, rule] of Object.entries(schema.properties)) {
		if (!(key in value)) continue;
		if (typeof value[key] !== rule.type) return `Tool argument ${key} must be ${rule.type}.`;
	}
	return undefined;
}

export function validateToolInvocation(toolName: string, toolInput: unknown): ToolPolicyResult {
	const name = toolName.trim();
	if (!name) return { allowed: false, reason: "Tool name is required." };
	const schema = TOOL_SCHEMAS[name];
	if (!schema) return { allowed: false, reason: `Tool is not allowlisted: ${name}` };
	const schemaError = matchesSchema(toolInput, schema);
	if (schemaError) return { allowed: false, reason: schemaError };
	if (name === "Bash") {
		const command = (toolInput as Record<string, unknown>)["command"] as string;
		if (command.length > 100_000 || command.includes("\u0000")) return { allowed: false, reason: "Bash command exceeds safety limits." };
		const blocked = BLOCKED_COMMANDS.some((pattern) => pattern.test(command));
		if (blocked) return { allowed: false, reason: "Destructive or remote shell execution requires explicit approval." };
	}
	return { allowed: true };
}

export function getToolPolicySchema(toolName: string): JsonSchema | undefined {
	return TOOL_SCHEMAS[toolName.trim()];
}
