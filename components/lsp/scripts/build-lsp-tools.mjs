#!/usr/bin/env node
// Build the repository-level lsp-tools-mcp package used by codex-lsp.
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const force = process.argv.includes("--force");

// Probed candidate directories:
// (1) 5-up repo sibling — monorepo checkout layout
// (2) 3-up plugin root — standalone checkout layout
const candidates = [
	join(__dirname, "..", "..", "..", "..", "..", "lsp-tools-mcp"),
	join(__dirname, "..", "..", "..", "lsp-tools-mcp"),
];

function requiredOutputs(dir) {
	return [
		join(dir, "dist", "cli.js"),
		join(dir, "dist", "tools.js"),
		join(dir, "dist", "lsp", "manager.js"),
	];
}

// Find the first buildable candidate (package.json present).
for (const dir of candidates) {
	const packageJson = join(dir, "package.json");
	if (existsSync(packageJson)) {
		const outputs = requiredOutputs(dir);
		if (!force && isBuildFresh(packageJson, outputs)) {
			process.exit(0);
		}
		console.log("Installing repository lsp-tools-mcp dependencies...");
		execSync("npm ci", { cwd: dir, stdio: "inherit" });
		console.log("Building repository lsp-tools-mcp...");
		execSync("npm run build", { cwd: dir, stdio: "inherit" });
		console.log("Done.");
		process.exit(0);
	}
}

// Fallback to pre-built bundled dist outputs
for (const dir of candidates) {
	const outputs = requiredOutputs(dir);
	if (outputs.every((p) => existsSync(p))) {
		console.log(`Using bundled lsp-tools-mcp dist at ${dir}.`);
		process.exit(0);
	}
}

const probedPaths = candidates.map((dir) => join(dir, "package.json")).join(", ");
console.error(
	`lsp-tools-mcp package metadata is missing at ${join(candidates[0], "package.json")}; build packages/lsp-tools-mcp before codex-lsp`,
);
console.error(`probed: ${probedPaths}`);
process.exit(1);

function isBuildFresh(inputPath, outputPaths) {
	if (!existsSync(inputPath)) return false;
	if (outputPaths.some((path) => !existsSync(path))) return false;
	const inputMtime = statSync(inputPath).mtimeMs;
	return outputPaths.every((path) => statSync(path).mtimeMs >= inputMtime);
}
