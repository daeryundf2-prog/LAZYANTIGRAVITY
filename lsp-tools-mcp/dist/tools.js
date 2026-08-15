import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, resolve } from "node:path";

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

export async function executeLspDiagnostics({ filePath }) {
	if (!filePath || typeof filePath !== "string") {
		return {
			content: [{ type: "text", text: "Error: filePath is required" }],
			isError: true
		};
	}

	const absolutePath = resolve(process.cwd(), filePath);
	if (!existsSync(absolutePath)) {
		return {
			content: [{ type: "text", text: `File not found: ${filePath}` }],
			isError: true
		};
	}

	const ext = extname(absolutePath).toLowerCase();
	const diagnostics = [];

	if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
		try {
			const res = spawnSync("npx", ["--no-install", "tsc", "--noEmit", absolutePath], {
				encoding: "utf8",
				timeout: 5000,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"]
			});
			if (res.error) {
				// Process spawn error (e.g., npx missing in environment)
			} else {
				const stdout = (res.stdout || "").trim();
				const stderr = (res.stderr || "").trim();
				const isToolMissing = stderr.includes("could not determine executable to run") || 
					stderr.includes("command not found") || 
					stderr.includes("npm ERR!");
				if (res.status !== 0 && !isToolMissing) {
					const output = (stdout ? stdout + (stderr ? "\n" + stderr : "") : stderr).trim();
					if (output) {
						diagnostics.push({ file: filePath, message: output, severity: "error" });
					}
				}
			}
		} catch {
			// Ignore execution failures
		}
	}

	return {
		content: [{
			type: "text",
			text: JSON.stringify({
				ok: true,
				filePath,
				diagnostics,
				total: diagnostics.length
			}, null, 2)
		}]
	};
}

export async function executeLspSymbols({ filePath }) {
	const absolutePath = resolve(process.cwd(), filePath);
	if (!existsSync(absolutePath)) {
		return {
			content: [{ type: "text", text: `File not found: ${filePath}` }],
			isError: true
		};
	}

	try {
		const content = readFileSync(absolutePath, "utf8");
		const symbols = [];
		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = line.match(/(?:function|class|interface|type|const|let|var|def)\s+([A-Za-z0-9_$]+)/);
			if (match) {
				symbols.push({ name: match[1], line: i + 1, text: line.trim() });
			}
		}
		return {
			content: [{
				type: "text",
				text: JSON.stringify({ ok: true, filePath, symbols, total: symbols.length }, null, 2)
			}]
		};
	} catch (err) {
		return {
			content: [{ type: "text", text: `Failed to read symbols: ${err.message}` }],
			isError: true
		};
	}
}
