#!/usr/bin/env node
// Build the repository-level lsp-tools-mcp package used by codex-lsp.
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findLspToolsDir() {
	const candidates = [
		join(__dirname, "..", "..", "lsp-tools-mcp"),
		join(__dirname, "..", "..", "..", "lsp-tools-mcp"),
		join(__dirname, "..", "..", "..", "packages", "lsp-tools-mcp"),
		join(__dirname, "..", "..", "..", "..", "lsp-tools-mcp"),
		join(__dirname, "..", "..", "..", "..", "packages", "lsp-tools-mcp"),
		join(__dirname, "..", "..", "..", "..", "..", "packages", "lsp-tools-mcp"),
		join(__dirname, "..", "..", "..", "..", "..", "lsp-tools-mcp"),
	];
	for (const candidate of candidates) {
		if (existsSync(join(candidate, "package.json"))) {
			return candidate;
		}
	}
	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return join(__dirname, "..", "..", "lsp-tools-mcp");
}

const lspToolsDir = findLspToolsDir();
const packageJson = join(lspToolsDir, "package.json");
const requiredOutputs = [
	join(lspToolsDir, "dist", "cli.js"),
	join(lspToolsDir, "dist", "tools.js"),
];
const force = process.argv.includes("--force");

function isBuildFresh(inputPath, outputPaths) {
	if (!existsSync(inputPath)) return false;
	if (outputPaths.some((path) => !existsSync(path))) return false;
	const inputMtime = statSync(inputPath).mtimeMs;
	return outputPaths.every((path) => statSync(path).mtimeMs >= inputMtime);
}

const hasAllOutputs = requiredOutputs.every((path) => existsSync(path));
// The committed dist counts as fresh unless package metadata is newer than the
// outputs; without package metadata the bundled dist is the source of truth.
const packageMetaFresh = !existsSync(packageJson) || isBuildFresh(packageJson, requiredOutputs);
if (!force && hasAllOutputs && packageMetaFresh) {
	console.log("Using bundled lsp-tools-mcp dist.");
	process.exit(0);
}

if (!existsSync(packageJson)) {
	console.error(
		`lsp-tools-mcp package metadata is missing at ${packageJson}; build packages/lsp-tools-mcp before codex-lsp`,
	);
	process.exit(1);
}

console.log("Installing repository lsp-tools-mcp dependencies...");
try {
	execSync("npm ci", { cwd: lspToolsDir, stdio: "inherit", shell: process.platform === "win32" });
} catch {
	execSync("npm install", { cwd: lspToolsDir, stdio: "inherit", shell: process.platform === "win32" });
}

if (existsSync(join(lspToolsDir, "package.json"))) {
	const pck = JSON.parse(await import("node:fs").then((m) => m.readFileSync(join(lspToolsDir, "package.json"), "utf8")));
	if (pck.scripts && pck.scripts.build) {
		console.log("Building repository lsp-tools-mcp...");
		execSync("npm run build", { cwd: lspToolsDir, stdio: "inherit", shell: process.platform === "win32" });
	}
}

console.log("Done.");
