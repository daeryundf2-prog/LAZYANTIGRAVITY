import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, resolve } from "node:path";

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const LSP_TOOLS = [
	{
		name: "lsp_diagnostics",
		description: "Retrieve compiler diagnostics and lint errors for workspace files (tsc / py_compile / go vet)."
		,
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
				column: { type: "integer", description: "1-indexed column number" },
				symbol: { type: "string", description: "Optional symbol name if line/column omitted" }
			},
			required: ["filePath"]
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

function jsonResult(payload) {
	return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message) {
	return { content: [{ type: "text", text: message }], isError: true };
}

export async function executeLspDiagnostics({ filePath }) {
	if (!filePath || typeof filePath !== "string") {
		return errorResult("Error: filePath is required");
	}

	const absolutePath = resolve(process.cwd(), filePath);
	if (!existsSync(absolutePath)) {
		return errorResult(`File not found: ${filePath}`);
	}

	const ext = extname(absolutePath).toLowerCase();
	const diagnostics = [];
	let toolAvailable = true;
	let toolNote;

	if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
		try {
			const res = spawnSync("npx", ["--no-install", "tsc", "--noEmit", absolutePath], {
				encoding: "utf8",
				timeout: 5000,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"]
			});
			const stdout = (res.stdout || "").trim();
			const stderr = (res.stderr || "").trim();
			const isToolMissing =
				res.error !== undefined ||
				stderr.includes("could not determine executable to run") ||
				stderr.includes("command not found") ||
				stderr.includes("npm ERR!");
			if (isToolMissing) {
				toolAvailable = false;
				toolNote = "TypeScript compiler (tsc) NOT INSTALLED; diagnostics were not run.";
			} else if (res.status !== 0) {
				const output = (stdout ? stdout + (stderr ? "\n" + stderr : "") : stderr).trim();
				if (output) {
					diagnostics.push({ file: filePath, message: output, severity: "error" });
				}
			}
		} catch {
			toolAvailable = false;
			toolNote = "TypeScript compiler (tsc) NOT INSTALLED; diagnostics were not run.";
		}
	} else if (ext === ".py") {
		try {
			const res = spawnSync("python3", ["-m", "py_compile", absolutePath], {
				encoding: "utf8",
				timeout: 5000,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"]
			});
			if (res.error !== undefined) {
				toolAvailable = false;
				toolNote = "python3 NOT INSTALLED; diagnostics were not run.";
			} else if (res.status !== 0) {
				const stderr = (res.stderr || "").trim();
				if (stderr) {
					diagnostics.push({ file: filePath, message: stderr, severity: "error" });
				}
			}
		} catch {
			toolAvailable = false;
			toolNote = "python3 NOT INSTALLED; diagnostics were not run.";
		}
	} else if (ext === ".go") {
		try {
			const res = spawnSync("go", ["vet", absolutePath], {
				encoding: "utf8",
				timeout: 5000,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"]
			});
			if (res.error !== undefined) {
				toolAvailable = false;
				toolNote = "go toolchain NOT INSTALLED; diagnostics were not run.";
			} else if (res.status !== 0) {
				const stderr = (res.stderr || res.stdout || "").trim();
				if (stderr) {
					diagnostics.push({ file: filePath, message: stderr, severity: "error" });
				}
			}
		} catch {
			toolAvailable = false;
			toolNote = "go toolchain NOT INSTALLED; diagnostics were not run.";
		}
	} else {
		toolAvailable = false;
		toolNote = `No diagnostics tool configured for extension '${ext}'.`;
	}

	const payload = { ok: true, filePath, diagnostics, total: diagnostics.length, toolAvailable };
	if (toolNote !== undefined) payload.toolNote = toolNote;
	return jsonResult(payload);
}

function extractSymbolAtCoordinates(content, line, column) {
	const lines = content.split("\n");
	if (line < 1 || line > lines.length) return "";
	const targetLine = lines[line - 1];
	const col = column ? column - 1 : 0;
	if (col < 0 || col >= targetLine.length) return "";

	// Match identifier at col
	let start = col;
	while (start > 0 && /[A-Za-z0-9_$]/.test(targetLine[start - 1])) {
		start--;
	}
	let end = col;
	while (end < targetLine.length && /[A-Za-z0-9_$]/.test(targetLine[end])) {
		end++;
	}
	return targetLine.slice(start, end).trim();
}

function walkProjectFiles(dir, maxDepth = 4, currentDepth = 0) {
	if (currentDepth > maxDepth) return [];
	const files = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (["node_modules", ".git", "dist", "build", ".lazycodex", ".omo"].includes(entry.name)) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				files.push(...walkProjectFiles(full, maxDepth, currentDepth + 1));
			} else if ([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go"].includes(extname(entry.name).toLowerCase())) {
				files.push(full);
			}
		}
	} catch {}
	return files;
}

export async function executeLspDefinitions({ filePath, line, column, symbol }) {
	const absolutePath = resolve(process.cwd(), filePath);
	if (!existsSync(absolutePath)) {
		return errorResult(`File not found: ${filePath}`);
	}

	try {
		const fileContent = readFileSync(absolutePath, "utf8");
		const targetSymbol = symbol || extractSymbolAtCoordinates(fileContent, line, column);
		if (!targetSymbol) {
			return jsonResult({ ok: true, definitions: [], message: "No symbol found at coordinates" });
		}

		const definitions = [];
		// Escape the symbol: it can come from arbitrary file content or tool args.
		const declPattern = new RegExp(`(?:export\\s+)?(?:pub\\s+)?(?:async\\s+)?(?:function|class|interface|type|const|let|var|def|fn|struct|enum|trait|typealias)\\s+(${escapeRegex(targetSymbol)})\\b`);

		const files = [absolutePath, ...walkProjectFiles(process.cwd())];
		const visited = new Set();

		for (const file of files) {
			if (visited.has(file)) continue;
			visited.add(file);
			try {
				const content = readFileSync(file, "utf8");
				const lines = content.split("\n");
				for (let i = 0; i < lines.length; i++) {
					const lineText = lines[i];
					if (declPattern.test(lineText)) {
						const isExported = /export|pub\b/.test(lineText);
						const isLocalFile = file === absolutePath;
						definitions.push({
							symbol: targetSymbol,
							filePath: file,
							line: i + 1,
							isExported,
							isLocalFile,
							text: lineText.trim()
						});
					}
				}
			} catch {}
		}

		// Sort definitions: local file first, then exported declarations
		definitions.sort((a, b) => {
			if (a.isLocalFile && !b.isLocalFile) return -1;
			if (!a.isLocalFile && b.isLocalFile) return 1;
			if (a.isExported && !b.isExported) return -1;
			if (!a.isExported && b.isExported) return 1;
			return 0;
		});

		return jsonResult({ ok: true, symbol: targetSymbol, definitions, total: definitions.length });
	} catch (err) {
		return errorResult(`Failed to find definitions: ${err.message}`);
	}
}

export async function executeLspReferences({ filePath, line, column, symbol }) {
	const absolutePath = resolve(process.cwd(), filePath);
	if (!existsSync(absolutePath)) {
		return errorResult(`File not found: ${filePath}`);
	}

	try {
		const fileContent = readFileSync(absolutePath, "utf8");
		const targetSymbol = symbol || extractSymbolAtCoordinates(fileContent, line, column);
		if (!targetSymbol) {
			return jsonResult({ ok: true, references: [], message: "No symbol identified" });
		}

		const references = [];
		// Escape the symbol: unescaped metacharacters can crash RegExp construction.
		const refPattern = new RegExp(`\\b${escapeRegex(targetSymbol)}\\b`);
		const files = walkProjectFiles(process.cwd());

		for (const file of files) {
			try {
				const content = readFileSync(file, "utf8");
				const lines = content.split("\n");
				for (let i = 0; i < lines.length; i++) {
					if (refPattern.test(lines[i])) {
						references.push({
							symbol: targetSymbol,
							filePath: file,
							line: i + 1,
							text: lines[i].trim()
						});
					}
				}
			} catch {}
		}

		return jsonResult({ ok: true, symbol: targetSymbol, references: references.slice(0, 100), total: references.length });
	} catch (err) {
		return errorResult(`Failed to find references: ${err.message}`);
	}
}

export async function executeLspSymbols({ filePath }) {
	const absolutePath = resolve(process.cwd(), filePath);
	if (!existsSync(absolutePath)) {
		return errorResult(`File not found: ${filePath}`);
	}

	try {
		const content = readFileSync(absolutePath, "utf8");
		const symbols = [];
		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = line.match(/(?:function|class|interface|type|const|let|var|def|fn|struct|enum)\s+([A-Za-z0-9_$]+)/);
			if (match) {
				symbols.push({ name: match[1], line: i + 1, text: line.trim() });
			}
		}
		return jsonResult({ ok: true, filePath, symbols, total: symbols.length });
	} catch (err) {
		return errorResult(`Failed to read symbols: ${err.message}`);
	}
}
