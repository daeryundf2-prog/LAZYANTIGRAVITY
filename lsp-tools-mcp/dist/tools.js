export const LSP_TOOLS = [
	{
		name: "lsp_diagnostics",
		description: "Retrieve LSP compiler diagnostics and lint errors for workspace files.",
		inputSchema: {
			type: "object",
			properties: {
				filePath: { type: "string", description: "Target file path to diagnose" }
			},
			required: ["filePath"]
		}
	},
	{
		name: "lsp_definitions",
		description: "Find definitions and source origins for symbols at specific coordinates.",
		inputSchema: {
			type: "object",
			properties: {
				filePath: { type: "string", description: "Source file path" },
				line: { type: "integer", description: "1-indexed line number" },
				column: { type: "integer", description: "1-indexed column number" }
			},
			required: ["filePath", "line", "column"]
		}
	},
	{
		name: "lsp_references",
		description: "Find all reference occurrences of a symbol across the project.",
		inputSchema: {
			type: "object",
			properties: {
				filePath: { type: "string", description: "Source file path" },
				line: { type: "integer", description: "1-indexed line number" },
				column: { type: "integer", description: "1-indexed column number" }
			},
			required: ["filePath", "line", "column"]
		}
	},
	{
		name: "lsp_symbols",
		description: "List document symbols, classes, functions, and interfaces.",
		inputSchema: {
			type: "object",
			properties: {
				filePath: { type: "string", description: "Target file path" }
			},
			required: ["filePath"]
		}
	}
];

export async function executeLspDiagnostics({ filePath, severity = "error" }) {
	return {
		content: [{ text: "No diagnostics found" }]
	};
}
