import { ASTSymbol, CallEdge, SymbolKind } from "./types.js";

export interface ExtractedFileEntities {
	symbols: ASTSymbol[];
	imports: string[];
	calls: CallEdge[];
}

export type SupportedLanguage = "typescript" | "python" | "rust" | "go" | "generic";

export function detectLanguage(filePath: string): SupportedLanguage {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	if (["ts", "tsx", "js", "jsx", "mts", "mjs", "cts", "cjs"].includes(ext)) return "typescript";
	if (["py", "pyi"].includes(ext)) return "python";
	if (ext === "rs") return "rust";
	if (ext === "go") return "go";
	return "generic";
}

export function extractEntities(filePath: string, content: string): ExtractedFileEntities {
	const lang = detectLanguage(filePath);
	switch (lang) {
		case "typescript":
			return extractTypeScript(filePath, content);
		case "python":
			return extractPython(filePath, content);
		case "rust":
			return extractRust(filePath, content);
		case "go":
			return extractGo(filePath, content);
		default:
			return extractTypeScript(filePath, content);
	}
}

function extractTypeScript(file: string, content: string): ExtractedFileEntities {
	const symbols: ASTSymbol[] = [];
	const imports: string[] = [];
	const calls: CallEdge[] = [];
	const lines = content.split("\n");
	let scope = "global";

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;
		const trimmed = line.trim();

		const imp = trimmed.match(/import\s+.*?from\s+["'](.*?)["']/);
		if (imp) imports.push(imp[1]);

		const isExported = /^(export\s+)/.test(trimmed);

		const fn = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\((.*?)\)/);
		if (fn) {
			scope = fn[1];
			symbols.push({ name: fn[1], kind: "function", file, line: lineNum, isExported, signature: `${fn[1]}(${fn[2]})` });
		} else {
			const cls = trimmed.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
			if (cls) {
				symbols.push({ name: cls[1], kind: "class", file, line: lineNum, isExported });
			} else {
				const iface = trimmed.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
				if (iface) {
					symbols.push({ name: iface[1], kind: "interface", file, line: lineNum, isExported });
				} else {
					const typ = trimmed.match(/(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
					if (typ) {
						symbols.push({ name: typ[1], kind: "type", file, line: lineNum, isExported });
					} else {
						const enm = trimmed.match(/(?:export\s+)?enum\s+([a-zA-Z0-9_$]+)/);
						if (enm) {
							symbols.push({ name: enm[1], kind: "enum", file, line: lineNum, isExported });
						} else {
							const arrow = trimmed.match(/(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\((.*?)\)\s*=>/);
							if (arrow) {
								scope = arrow[1];
								symbols.push({ name: arrow[1], kind: "function", file, line: lineNum, isExported, signature: `${arrow[1]}(${arrow[2]})` });
							}
						}
					}
				}
			}
		}

		collectCalls(trimmed, file, lineNum, scope, calls);
	}
	return { symbols, imports, calls };
}

function extractPython(file: string, content: string): ExtractedFileEntities {
	const symbols: ASTSymbol[] = [];
	const imports: string[] = [];
	const calls: CallEdge[] = [];
	const lines = content.split("\n");
	let scope = "global";

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;
		const trimmed = line.trim();

		const imp = trimmed.match(/^(?:from\s+([a-zA-Z0-9_.]+)\s+import|import\s+([a-zA-Z0-9_.]+))/);
		if (imp) imports.push(imp[1] || imp[2]);

		const fn = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/);
		if (fn) {
			const name = fn[1];
			scope = name;
			symbols.push({ name, kind: "function", file, line: lineNum, isExported: !name.startsWith("_"), signature: `${name}(${fn[2]})` });
		} else {
			const cls = trimmed.match(/^class\s+([a-zA-Z0-9_]+)/);
			if (cls) {
				symbols.push({ name: cls[1], kind: "class", file, line: lineNum, isExported: !cls[1].startsWith("_") });
			}
		}

		collectCalls(trimmed, file, lineNum, scope, calls);
	}
	return { symbols, imports, calls };
}

function extractRust(file: string, content: string): ExtractedFileEntities {
	const symbols: ASTSymbol[] = [];
	const imports: string[] = [];
	const calls: CallEdge[] = [];
	const lines = content.split("\n");
	let scope = "global";

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;
		const trimmed = line.trim();

		const use = trimmed.match(/^use\s+([a-zA-Z0-9_:]+)/);
		if (use) imports.push(use[1]);

		const isPub = trimmed.startsWith("pub ");

		const fn = trimmed.match(/(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/);
		if (fn) {
			scope = fn[1];
			symbols.push({ name: fn[1], kind: "function", file, line: lineNum, isExported: isPub, signature: `${fn[1]}(${fn[2]})` });
		} else {
			const st = trimmed.match(/(?:pub(?:\([^)]+\))?\s+)?struct\s+([a-zA-Z0-9_]+)/);
			if (st) {
				symbols.push({ name: st[1], kind: "struct", file, line: lineNum, isExported: isPub });
			} else {
				const en = trimmed.match(/(?:pub(?:\([^)]+\))?\s+)?enum\s+([a-zA-Z0-9_]+)/);
				if (en) {
					symbols.push({ name: en[1], kind: "enum", file, line: lineNum, isExported: isPub });
				} else {
					const tr = trimmed.match(/(?:pub(?:\([^)]+\))?\s+)?trait\s+([a-zA-Z0-9_]+)/);
					if (tr) {
						symbols.push({ name: tr[1], kind: "trait", file, line: lineNum, isExported: isPub });
					}
				}
			}
		}

		collectCalls(trimmed, file, lineNum, scope, calls);
	}
	return { symbols, imports, calls };
}

function extractGo(file: string, content: string): ExtractedFileEntities {
	const symbols: ASTSymbol[] = [];
	const imports: string[] = [];
	const calls: CallEdge[] = [];
	const lines = content.split("\n");
	let scope = "global";

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;
		const trimmed = line.trim();

		const imp = trimmed.match(/^import\s+["'](.*?)["']/);
		if (imp) imports.push(imp[1]);

		const fn = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\((.*?)\)/);
		if (fn) {
			const name = fn[1];
			scope = name;
			const isExported = /^[A-Z]/.test(name);
			symbols.push({ name, kind: "function", file, line: lineNum, isExported, signature: `${name}(${fn[2]})` });
		} else {
			const typ = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
			if (typ) {
				const name = typ[1];
				const isExported = /^[A-Z]/.test(name);
				const kind: SymbolKind = typ[2] === "struct" ? "struct" : "interface";
				symbols.push({ name, kind, file, line: lineNum, isExported });
			}
		}

		collectCalls(trimmed, file, lineNum, scope, calls);
	}
	return { symbols, imports, calls };
}

function collectCalls(trimmed: string, file: string, line: number, caller: string, calls: CallEdge[]) {
	const ignored = new Set([
		"if", "for", "while", "switch", "catch", "function", "return", "def", "class",
		"fn", "struct", "enum", "trait", "func", "type", "import", "package", "const", "let", "var"
	]);
	const callMatches = trimmed.matchAll(/\b([a-zA-Z0-9_$]+)\s*\(/g);
	for (const match of callMatches) {
		const callee = match[1];
		if (!ignored.has(callee) && callee !== caller) {
			calls.push({ caller, callee, file, line });
		}
	}
}
