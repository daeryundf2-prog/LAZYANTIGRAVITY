#!/usr/bin/env node
import { createInterface } from "node:readline";
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

// Real structural matching runs on @ast-grep/napi (tree-sitter) when the
// optional dependency is installed; otherwise the line-based regex matcher
// below is used. LAZYANTIGRAVITY_AST_ENGINE=regex forces the fallback.
const NAPI_LANGUAGE_KEYS = {
	ts: "TypeScript",
	tsx: "TypeScript",
	mts: "TypeScript",
	cts: "TypeScript",
	js: "JavaScript",
	jsx: "JavaScript",
	mjs: "JavaScript",
	cjs: "JavaScript",
	py: "Python",
	rs: "Rust",
	go: "Go",
	json: "Json",
	css: "Css",
	html: "Html",
};
let napiEnginePromise = null;

async function getNapiEngine() {
	if (process.env["LAZYANTIGRAVITY_AST_ENGINE"] === "regex") return null;
	if (napiEnginePromise === null) {
		// Keep the module namespace object: native napi functions must not be
		// destructured away from their receiver.
		napiEnginePromise = import("@ast-grep/napi").then((m) => m).catch(() => null);
	}
	return napiEnginePromise;
}

function napiLanguageKeyForFile(filePath) {
	const base = filePath.split(/[\\/]/).pop() ?? "";
	const dot = base.lastIndexOf(".");
	if (dot === -1) return null;
	const ext = base.slice(dot + 1).toLowerCase();
	return NAPI_LANGUAGE_KEYS[ext] ?? null;
}

// Returns null when structural matching is unavailable for this file, so the
// caller can fall back to the regex engine.
function structuralMatches(napi, filePath, source, pattern) {
	try {
		const langKey = napiLanguageKeyForFile(filePath);
		if (!langKey || napi.Lang[langKey] === undefined) return null;
		const sg = napi.parse(napi.Lang[langKey], source);
		const nodes = sg.root().findAll(pattern);
		return nodes.map((node) => {
			const range = node.range();
			return {
				file: filePath,
				line: range.start.line + 1,
				column: range.start.column + 1,
				text: node.text().trim(),
			};
		});
	} catch {
		return null;
	}
}

// Interpolates $NAME metavariables from a pattern match into the rewrite
// template. Multi-variables ($$$X) are not exposed by the napi node API here,
// so rewrites referencing them return null and the caller uses the regex
// engine instead of producing wrong output.
function interpolateRewrite(node, rewrite) {
	let out = rewrite;
	for (const ref of rewrite.matchAll(/\${1,3}[A-Za-z][A-Za-z0-9_]*/g)) {
		const token = ref[0];
		if (token.startsWith("$$$")) return null;
		const matched = node.getMatch(token.slice(1));
		if (!matched) return null;
		out = out.split(token).join(matched.text());
	}
	return out;
}

function structuralReplace(napi, filePath, source, pattern, rewrite) {
	try {
		const langKey = napiLanguageKeyForFile(filePath);
		if (!langKey || napi.Lang[langKey] === undefined) return null;
		const sg = napi.parse(napi.Lang[langKey], source);
		const nodes = sg.root().findAll(pattern);
		if (nodes.length === 0) return { updated: null, replacements: 0 };
		const edits = [];
		for (const node of nodes) {
			const interpolated = interpolateRewrite(node, rewrite);
			if (interpolated === null) return null;
			edits.push(node.replace(interpolated));
		}
		return { updated: sg.root().commitEdits(edits), replacements: edits.length };
	} catch {
		return null;
	}
}

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
	html: [".html"],
	css: [".css"],
};
const DEFAULT_EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".lazycodex", ".omo", ".lazyantigravity"]);
const MAX_FILES = 5000;
const MAX_WALK_MS = 5000;

function getWorkspaceRoot() {
	return resolve(process.env["LAZYANTIGRAVITY_WORKSPACE_ROOT"] || process.cwd());
}

function isInsideRoot(candidate, root) {
	const withSep = candidate.endsWith(sep) ? candidate : candidate + sep;
	return withSep.startsWith(root.endsWith(sep) ? root : root + sep);
}

function resolveLanguageExts(language) {
	const key = language?.toLowerCase() ?? "";
	if (LANGUAGE_EXTENSIONS[key]) return LANGUAGE_EXTENSIONS[key];
	if (key.startsWith("javascript")) return LANGUAGE_EXTENSIONS.javascript;
	if (key.startsWith("typescript")) return LANGUAGE_EXTENSIONS.typescript;
	return [];
}

// Only relative paths inside the workspace are accepted. Absolute paths and
// `~/...` shortcuts are rejected outright so the tool can never be pointed at
// files outside the workspace root.
function confineRoots(root, pathSpec) {
	if (pathSpec === undefined || pathSpec === null) return { ok: true, roots: [root] };
	const specs = Array.isArray(pathSpec) ? pathSpec : [pathSpec];
	const roots = [];
	for (const spec of specs) {
		if (typeof spec !== "string" || spec.length === 0) {
			return { ok: false, error: "paths entries must be non-empty strings." };
		}
		if (spec.startsWith("~") || isAbsolute(spec) || /^[A-Za-z]:[\\/]/.test(spec)) {
			return { ok: false, error: `paths entry '${spec}' must be a workspace-relative path (absolute and ~ paths are rejected).` };
		}
		const candidate = resolve(root, spec);
		if (!isInsideRoot(candidate, root)) {
			return { ok: false, error: `paths entry '${spec}' resolves outside the workspace root (${root}).` };
		}
		roots.push(candidate);
	}
	return { ok: true, roots };
}

function collectFiles(root, pathSpec, exts) {
	const confinement = confineRoots(root, pathSpec);
	if (!confinement.ok) return { ok: false, error: confinement.error, files: [] };

	const files = [];
	const deadline = Date.now() + MAX_WALK_MS;
	const walk = (dir) => {
		if (files.length >= MAX_FILES || Date.now() > deadline) return;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (files.length >= MAX_FILES || Date.now() > deadline) return;
			if (DEFAULT_EXCLUDED_DIRS.has(entry.name)) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isSymbolicLink()) {
				// Follow symlinks only when their target stays inside the workspace root.
				try {
					const real = realpathSync(full);
					const stats = statSync(real);
					if (!isInsideRoot(real, root)) continue;
					if (stats.isDirectory()) {
						walk(real);
					} else if (exts.length === 0 || exts.includes(extnameOf(full))) {
						files.push(full);
					}
				} catch {
					// Broken symlink: skip.
				}
			} else if (exts.length === 0 || exts.includes(extnameOf(full))) {
				files.push(full);
			}
		}
	};
	for (const r of confinement.roots) {
		walk(r);
	}
	const truncated = files.length >= MAX_FILES || Date.now() > deadline;
	return { ok: true, files, truncated };
}

function extnameOf(p) {
	const base = p.split(/[\\/]/).pop() ?? "";
	const dot = base.lastIndexOf(".");
	return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegex(pattern) {
	// Convert ast-grep style patterns like `console.log($A)` into regexes.
	// NOTE: matching is line-based; multi-line patterns only match within a line.
	let regexStr = "";
	const tokens = pattern.split(/(\$\$\$|\$[A-Za-z0-9_]+)/);
	for (const token of tokens) {
		if (token === "$$$") {
			regexStr += "[\\s\\S]*?";
		} else if (token.startsWith("$") && token.length > 1) {
			regexStr += "(?:[A-Za-z0-9_$.'\"]+|[^,);{}]+)";
		} else if (token) {
			regexStr += escapeRegex(token).replace(/\\ /g, "\\s+");
		}
	}
	return new RegExp(regexStr, "g");
}

function searchInFile(filePath, pattern, isRegex) {
	let content;
	try {
		content = readFileSync(filePath, "utf8");
	} catch {
		return [];
	}
	const matches = [];
	const re = isRegex ? new RegExp(pattern, "g") : patternToRegex(pattern);

	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		re.lastIndex = 0;
		let m;
		while ((m = re.exec(line)) !== null) {
			matches.push({ file: filePath, line: i + 1, column: m.index + 1, text: line.trim() });
			if (m.index === re.lastIndex) re.lastIndex++;
		}
	}
	return matches;
}

async function runSearch(args) {
	const root = getWorkspaceRoot();
	const rawPattern = String(args.pattern ?? "").trim();
	if (!rawPattern) {
		return { ok: false, error: "Empty pattern provided." };
	}
	const isRegex = Boolean(args.regex);
	const langs = Array.isArray(args.language) ? args.language : args.language ? [args.language] : [];
	const collected = collectFiles(root, args.paths, langs.flatMap(resolveLanguageExts));
	if (!collected.ok) {
		return { ok: false, error: collected.error };
	}
	const napi = isRegex ? null : await getNapiEngine();
	const matches = [];
	for (const file of collected.files) {
		if (napi) {
			let content;
			try {
				content = readFileSync(file, "utf8");
			} catch {
				continue;
			}
			const structural = structuralMatches(napi, file, content, rawPattern);
			if (structural !== null) {
				matches.push(...structural);
				continue;
			}
		}
		for (const m of searchInFile(file, rawPattern, isRegex)) matches.push(m);
	}
	const cap = matches.slice(0, 500);
	return {
		ok: true,
		matches: cap,
		truncated: matches.length > cap.length || collected.truncated,
		totalMatches: matches.length,
	};
}

async function runReplace(args) {
	const root = getWorkspaceRoot();
	const rawPattern = String(args.pattern ?? "").trim();
	const rewrite = String(args.rewrite ?? "");
	if (!rawPattern) {
		return { ok: false, error: "Empty pattern provided." };
	}
	const dryRun = args.dryRun !== false;
	const collected = collectFiles(root, args.paths, []);
	if (!collected.ok) {
		return { ok: false, error: collected.error };
	}
	const re = patternToRegex(rawPattern);
	const napi = await getNapiEngine();
	const changedFiles = [];

	for (const file of collected.files) {
		// Defense in depth: re-check containment right before writing.
		if (!isInsideRoot(resolve(file), root)) continue;
		try {
			const original = readFileSync(file, "utf8");
			let updated = null;
			let replacements = 0;
			if (napi) {
				const structural = structuralReplace(napi, file, original, rawPattern, rewrite);
				if (structural !== null && structural.replacements > 0) {
					updated = structural.updated;
					replacements = structural.replacements;
				}
			}
			if (updated === null && re.test(original)) {
				re.lastIndex = 0;
				updated = original.replace(re, rewrite);
				replacements = (original.match(re) || []).length;
			}
			if (updated !== null) {
				changedFiles.push({ file, replacements });
				if (!dryRun) {
					writeFileSync(file, updated, "utf8");
				}
			}
		} catch {}
	}

	return {
		ok: true,
		dryRun,
		changedFiles,
		totalFilesChanged: changedFiles.length,
		truncatedWalk: collected.truncated,
		message: dryRun ? "Dry-run complete (no files written)." : "Replacements applied.",
	};
}

const TOOLS = [
	{
		name: "ast_grep_search",
		description: "Search code structurally across workspace files. Uses tree-sitter (via the optional @ast-grep/napi dependency) when available, with a line-based regex fallback. Paths must be workspace-relative.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "AST pattern string to search for (e.g. `console.log($MSG)`)" },
				language: { type: "string", description: "Programming language (typescript, javascript, python, rust, go)" },
				paths: { type: "array", items: { type: "string" }, description: "Workspace-relative paths to search within (absolute and ~ paths are rejected)" },
				regex: { type: "boolean", description: "Treat pattern as a regular expression" }
			},
			required: ["pattern"]
		}
	},
	{
		name: "ast_grep_replace",
		description: "Perform structural code replacements across workspace files (tree-sitter when @ast-grep/napi is installed, regex fallback). dryRun defaults to true; writes are confined to the workspace root.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "Target AST pattern (e.g. `console.log($MSG)`)" },
				rewrite: { type: "string", description: "Replacement template (e.g. `logger.info($MSG)`)" },
				paths: { type: "array", items: { type: "string" }, description: "Workspace-relative paths to replace within" },
				dryRun: { type: "boolean", description: "Preview changes without modifying files (default true)" }
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
				serverInfo: { name: "ast-grep-mcp", version: "0.4.0" }
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
			result = await runReplace(args);
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
