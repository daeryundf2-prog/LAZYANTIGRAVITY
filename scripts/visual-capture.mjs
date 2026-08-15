#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2] || "http://localhost:5173";
const outputDir = join(process.cwd(), ".lazyantigravity", "screenshots");
if (!existsSync(outputDir)) {
	mkdirSync(outputDir, { recursive: true });
}

const filename = `capture-${Date.now()}.png`;
const outputPath = process.argv[3] || join(outputDir, filename);

console.log(`[Visual-Capture] Capturing screenshot for: ${target}`);
console.log(`[Visual-Capture] Destination: ${outputPath}`);

// Use playwright CLI to capture screenshot headless
const result = spawnSync("npx", [
	"-y",
	"playwright",
	"screenshot",
	target,
	outputPath,
	"--viewport-size=1280,800",
	"--full-page"
], {
	shell: process.platform === "win32",
	stdio: "inherit",
});

if (result.status === 0 && existsSync(outputPath)) {
	console.log(`[Visual-Capture] Successfully saved: ${outputPath}`);
	process.exit(0);
} else {
	console.error(`[Visual-Capture] Capture failed with exit code ${result.status}`);
	process.exit(result.status || 1);
}
