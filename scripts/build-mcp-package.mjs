#!/usr/bin/env node
/**
 * Builds a root-level bundled MCP package by copying its src/ into dist/.
 * Run from the package directory (npm run build inside <mcp-package>/).
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const packageRoot = process.cwd();
const src = join(packageRoot, "src", "cli.mjs");
const distDir = join(packageRoot, "dist");

mkdirSync(distDir, { recursive: true });
copyFileSync(src, join(distDir, "cli.js"));
console.log(`[build-mcp-package] ${join(packageRoot, "src", "cli.mjs")} -> ${join(distDir, "cli.js")}`);
