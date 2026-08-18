import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { indexSourceFile } from "./indexer.js";
import { ProjectASTGraph } from "./types.js";

export function getCachePath(cwd: string = process.cwd()): string {
	const cacheDir = join(cwd, ".lazyantigravity", "cache");
	if (!existsSync(cacheDir)) {
		mkdirSync(cacheDir, { recursive: true });
	}
	return join(cacheDir, "ast-graph.json");
}

export function loadASTGraph(cwd: string = process.cwd()): ProjectASTGraph | null {
	const p = getCachePath(cwd);
	if (!existsSync(p)) return null;
	try {
		return JSON.parse(readFileSync(p, "utf8"));
	} catch {
		return null;
	}
}

export function saveASTGraph(graph: ProjectASTGraph, cwd: string = process.cwd()): void {
	const p = getCachePath(cwd);
	writeFileSync(p, JSON.stringify(graph, null, 2), "utf8");
}

export function scanSourceFiles(dir: string, fileList: string[] = []): string[] {
	if (!existsSync(dir)) return fileList;

	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (["node_modules", ".git", "dist", "build", ".lazyantigravity", ".omo"].includes(entry.name)) {
				continue;
			}
			scanSourceFiles(fullPath, fileList);
		} else if (entry.isFile()) {
			if (/\.(ts|tsx|js|mjs|cjs|py)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
				fileList.push(resolve(fullPath));
			}
		}
	}
	return fileList;
}

export function buildIncrementalASTGraph(targetDir: string = process.cwd()): ProjectASTGraph {
	const existing = loadASTGraph(targetDir);
	const files = scanSourceFiles(targetDir);

	const graph: ProjectASTGraph = {
		version: "1.0.0",
		generatedAt: Date.now(),
		files: existing ? { ...existing.files } : {},
	};

	for (const file of files) {
		const stat = statSync(file);
		const cached = graph.files[file];

		if (!cached || cached.mtimeMs < stat.mtimeMs) {
			try {
				graph.files[file] = indexSourceFile(file);
			} catch {}
		}
	}

	saveASTGraph(graph, targetDir);
	return graph;
}
