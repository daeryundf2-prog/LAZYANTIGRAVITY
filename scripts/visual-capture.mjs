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

// Pin the Playwright version so the CLI's browser revision matches the
// locally installed cache (`~/Library/Caches/ms-playwright/...`).
const PLAYWRIGHT_VERSION = "1.58.0";

function runPlaywright(argsArray, stdio = "inherit") {
	return spawnSync("npx", ["-y", `playwright@${PLAYWRIGHT_VERSION}`, ...argsArray], {
		shell: process.platform === "win32",
		stdio,
	});
}

console.log(`[Visual-Capture] Capturing screenshot for: ${target}`);
console.log(`[Visual-Capture] Destination: ${outputPath}`);

function capture() {
	return runPlaywright(["screenshot", target, outputPath, "--viewport-size=1280,800", "--full-page"]);
}

// Use playwright CLI to capture screenshot headless
let result = capture();

// Auto-install the browser if it is missing (fresh environment), then retry once.
if (result.status !== 0 && !existsSync(outputPath)) {
	console.log("[Visual-Capture] Browser missing or corpus mismatch; installing chromium...");
	const install = runPlaywright(["install", "chromium"]);
	if (install.status === 0) {
		result = capture();
	}
}

if (result.status === 0 && existsSync(outputPath)) {
	console.log(`[Visual-Capture] Successfully saved: ${outputPath}`);
	process.exit(0);
} else {
	console.error(`[Visual-Capture] Capture failed with exit code ${result.status}`);
	process.exit(result.status || 1);
}
