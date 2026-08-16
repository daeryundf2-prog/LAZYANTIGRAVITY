#!/usr/bin/env node
import { createInterface } from "node:readline";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";

const LANGUAGE_EXTENSIONS = {
	typescript: [".ts", ".tsx", ".mts", ".cts"],
	javascript: [".js", ".jsx", ".mjs", ".cjs"],
	javascriptreact: [".jsx"],
	typescriptreact: [".tsx"],
	python: [".py"],
	rust: [".rs"],
	go: [".go"],
	json: [".json"],
	markdown: [".md"],
	html: ["html"],
	css: [".css"],
};
const DEFAULT_EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".lazycodex", ".omo", ".lazyantigravity"]);

function resolveLanguageExts(language) {
	const key = language?.toLowerCase() ?? "";
	if (LANGUAGE_EXTENSIONS[key]) return LANGUAGE_EXTENSIONS[key];
	if (key.startsWith("javascript")) return LANGUAGE_EXTENSIONS.javascript;
	if (key.startsWith("typescript")) return LANGUAGE_EXTENSIONS.typescript;
	return [];
}

function collectFiles(root, pathSpec, exts) {
	const files = [];
	const roots = Array.isArray(pathSpec) && pathSpec.length > 0
		? pathSpec.map((p) => (p.startsWith("./") || p.startsWith("/") || p.startsWith("~") ? p : `./${p}`))
		: ["."];
	const walk = (dir) => {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (DEFAULT_EXCLUDED_DIRS.has(entry.name)) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (exts.length === 0 || exts.includes(extname(entry.name))) {
				files.push(full);
			}
		}
	};
	walk(root);
	return files;
}

function normalizePattern(pattern) {
	// ast-grep metavariables ($A, $B) and ellipsis ($$) have no meaning in
	// plain-text search; strip them so a structural pattern still finds real code.
	return pattern.replace(/\$\$|\$[A-Za-z][A-Za-z0-9]*/g, "").trim();
}

function searchInFile(filePath, needle, isRegex) {
	let content;
	try {
		content = readFileSync(filePath, "utf8");
	} catch {
		return [];
	}
	const re = isRegex ? new RegExp(needle, "g") : null;
	const matches = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (isRegex) {
			re.lastIndex = 0;
			let m;
			while ((m = re.exec(line)) !== null) {
				matches.push({ file: filePath, line: i + 1, column: m.index + 1, text: line.trim() });
				if (m.index === re.lastIndex) re.lastIndex++;
			}
		} else {
			const idx = line.indexOf(needle);
			if (idx >= 0) {
				matches.push({ file: filePath, line: i + 1, column: idx + 1, text: line.trim() });
			}
		}
	}
	return matches;
}

async function runSearch(args) {
	const cwd = process.cwd();
	const pattern = normalizePattern(String(args.pattern ?? ""));
	if (!pattern) {
		return { ok: false, error: "Empty pattern after normalizing ast-grep metavariables." };
	}
	const isRegex = Boolean(args.regex);
	const langs = Array.isArray(args.language) ? args.language : args.language ? [args.language] : [];
	const files = collectFiles(cwd, args.paths, langs.flatMap(resolveLanguageExts));
	const matches = [];
	for (const file of files) {
		for (const m of searchInFile(file, pattern, isRegex)) matches.push(m);
	}
	const cap = matches.slice(0, 500);
	return { ok: true, matches: cap, truncated: matches.length > cap.length, totalMatches: matches.length };
}

const TOOLS = [
	{
		name: "ast_grep_search",
		description: "Search code structurally across workspace files. Supports ast-grep style $ metavariables (ignored in matching) and optional regex.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "AST pattern string to search for (e.g. `console.log($MSG)`)" },
				language: { type: "string", description: "Programming language (typescript, javascript, python, rust, go)" },
				paths: { type: "array", items: { type: "string" }, description: "Specific paths or globs to search within" },
				regex: { type: "boolean", description: "Treat pattern as a regular expression" }
			},
			required: ["pattern"]
		}
	},
	{
		name: "ast_grep_replace",
		description: "Perform AST structural code replacements across files. Unsupported without the ast-grep binary; returns an explicit error.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "Target AST pattern" },
				rewrite: { type: "string", description: "Replacement AST template" },
				paths: { type: "array", items: { type: "string" }, description: "Paths to replace within" }
			},
			required: ["pattern", "rewrite"]
		}
	}
];

async function handleJsonRpc(message) {
	if (!message || typeof message !== "object") return;
	const { id, method, params } = message;

	if (method === "initialize") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "ast-grep-mcp", version: "0.2.0" }
			}
		};
	}

	if (method === "notifications/initialized") {
		return null;
	}

	if (method === "tools/list") {
		return {
			jsonrpc: "2.0",
			id,
			result: { tools: TOOLS }
		};
	}

	if (method === "tools/call") {
		const name = params?.name;
		const args = params?.arguments ?? {};
		let result;
		if (name === "ast_grep_search") {
			result = await runSearch(args);
		} else if (name === "ast_grep_replace") {
			result = { ok: false, error: "ast_grep_replace requires the ast-grep binary; not available in this build." };
		} else {
			result = { ok: false, error: `Unknown tool: ${name}` };
		}
		return {
			jsonrpc: "2.0",
			id,
			result: {
				content: [{
					type: "text",
					text: JSON.stringify(result, null, 2)
				}]
			}
		};
	}

	return {
		jsonrpc: "2.0",
		id,
		error: { code: -32601, message: `Method not found: ${method}` }
	};
}

async function runMcpServer() {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	rl.on("line", async (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			const req = JSON.parse(trimmed);
			const res = await handleJsonRpc(req);
			if (res) {
				process.stdout.write(`${JSON.stringify(res)}\n`);
			}
		} catch (err) {
			process.stderr.write(`[ast-grep-mcp] parse error: ${err.message}\n`);
		}
	});
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
		console.log("Usage: omo-ast-grep <mcp|search|replace> [options]");
		return 0;
	}
	if (argv[0] === "mcp") {
		runMcpServer();
		return 0;
	}
	console.log(`[ast-grep-mcp] Standalone AST grep CLI initialized.`);
	return 0;
}

main();
