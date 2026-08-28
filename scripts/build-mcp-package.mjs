#!/usr/bin/env node
/**
 * Builds a root-level bundled MCP package by compiling its src tree into
 * dist (each src .mjs file becomes a dist .js file with the same relative
 * path). Run from the package directory (npm run build inside the package).
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const packageRoot = process.cwd();
const srcRoot = join(packageRoot, "src");
const distRoot = join(packageRoot, "dist");

function copyTree(srcDir, distDir) {
	mkdirSync(distDir, { recursive: true });
	for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
		const srcPath = join(srcDir, entry.name);
		const distPath = join(distDir, entry.name.replace(/\.mjs$/, ".js"));
		if (entry.isDirectory()) {
			copyTree(srcPath, distPath);
		} else if (entry.name.endsWith(".mjs")) {
			copyFileSync(srcPath, distPath);
		}
	}
}

copyTree(srcRoot, distRoot);
console.log(`[build-mcp-package] ${srcRoot} -> ${distRoot}`);
