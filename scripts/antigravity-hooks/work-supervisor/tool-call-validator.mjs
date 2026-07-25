const TOOL_SCHEMAS = {
	run_command: {
		required: ["CommandLine"],
		optional: ["Cwd", "WaitMsBeforeAsync", "RunPersistent", "RequestedTerminalID"],
		types: { CommandLine: "string", Cwd: "string", WaitMsBeforeAsync: "number", RunPersistent: "boolean", RequestedTerminalID: "string" },
	},
	write_to_file: {
		required: ["TargetFile", "CodeContent"],
		optional: ["Overwrite", "Description", "IsArtifact", "ArtifactMetadata"],
		types: { TargetFile: "string", CodeContent: "string", Overwrite: "boolean", Description: "string", IsArtifact: "boolean" },
	},
	replace_file_content: {
		required: ["TargetFile", "TargetContent", "ReplacementContent"],
		optional: ["Instruction", "Description", "AllowMultiple", "StartLine", "EndLine", "TargetLintErrorIds"],
		types: { TargetFile: "string", TargetContent: "string", ReplacementContent: "string", AllowMultiple: "boolean", StartLine: "number", EndLine: "number" },
	},
	multi_replace_file_content: {
		required: ["TargetFile", "ReplacementChunks"],
		optional: ["Instruction", "Description", "TargetLintErrorIds", "ArtifactMetadata"],
		types: { TargetFile: "string", ReplacementChunks: "object" },
	},
	view_file: {
		required: ["AbsolutePath"],
		optional: ["StartLine", "EndLine", "IsSkillFile"],
		types: { AbsolutePath: "string", StartLine: "number", EndLine: "number" },
	},
	list_dir: {
		required: ["DirectoryPath"],
		optional: [],
		types: { DirectoryPath: "string" },
	},
	find_by_name: {
		required: ["SearchDirectory", "Pattern"],
		optional: ["Type", "Excludes", "Extensions", "FullPath", "MaxDepth"],
		types: { SearchDirectory: "string", Pattern: "string", MaxDepth: "number" },
	},
	grep_search: {
		required: ["SearchPath", "Query"],
		optional: ["IsRegex", "CaseInsensitive", "Includes", "MatchPerLine"],
		types: { SearchPath: "string", Query: "string", IsRegex: "boolean", CaseInsensitive: "boolean" },
	},
	search_web: {
		required: ["query"],
		optional: ["domain"],
		types: { query: "string", domain: "string" },
	},
	read_url_content: {
		required: ["Url"],
		optional: [],
		types: { Url: "string" },
	},
	ask_question: {
		required: ["questions"],
		optional: [],
		types: { questions: "object" },
	},
	invoke_subagent: {
		required: ["Subagents"],
		optional: [],
		types: { Subagents: "object" },
	},
};

const PATH_TRAVERSAL_RE = /\.\.[/\\]/;
const COMMAND_INJECTION_RE = /[;&|`$(){}]/;

export function validateToolCall(toolName, toolArgs) {
	const schema = TOOL_SCHEMAS[toolName];
	if (!schema) return { valid: true, warnings: [] };

	const errors = [];
	const warnings = [];

	for (const field of schema.required) {
		if (!(field in toolArgs) || toolArgs[field] === undefined || toolArgs[field] === null) {
			errors.push(`필수 인자 누락: ${field}`);
		}
	}

	for (const [field, value] of Object.entries(toolArgs)) {
		const expectedType = schema.types[field];
		if (!expectedType) {
			warnings.push(`알 수 없는 인자: ${field}`);
			continue;
		}
		if (value !== undefined && value !== null) {
			const actualType = Array.isArray(value) ? "object" : typeof value;
			if (actualType !== expectedType) {
				errors.push(`타입 오류: ${field} (expected ${expectedType}, got ${actualType})`);
			}
		}
	}

	if (toolArgs.TargetFile && typeof toolArgs.TargetFile === "string") {
		if (PATH_TRAVERSAL_RE.test(toolArgs.TargetFile)) {
			errors.push(`경로 순회 공격 감지: TargetFile에 .. 포함`);
		}
	}
	if (toolArgs.AbsolutePath && typeof toolArgs.AbsolutePath === "string") {
		if (PATH_TRAVERSAL_RE.test(toolArgs.AbsolutePath)) {
			errors.push(`경로 순회 공격 감지: AbsolutePath에 .. 포함`);
		}
	}
	if (toolArgs.DirectoryPath && typeof toolArgs.DirectoryPath === "string") {
		if (PATH_TRAVERSAL_RE.test(toolArgs.DirectoryPath)) {
			errors.push(`경로 순회 공격 감지: DirectoryPath에 .. 포함`);
		}
	}

	if (toolName === "read_url_content" && toolArgs.Url) {
		if (!toolArgs.Url.startsWith("http://") && !toolArgs.Url.startsWith("https://")) {
			errors.push(`URL 형식 오류: http(s):// 필요`);
		}
	}

	if (toolName === "run_command" && toolArgs.CommandLine) {
		const cmd = toolArgs.CommandLine;
		if (/rm\s+-rf\s+\/(?:\s|$)/.test(cmd)) {
			errors.push(`위험 명령 감지: rm -rf / (루트 삭제)`);
		}
		if (/:(){ :|:& };:/.test(cmd)) {
			errors.push(`위험 명령 감지: fork bomb`);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}
