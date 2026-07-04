#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
const venvPath = join(root, ".omo", "ulw-loop", "browsing-venv");

console.log("=== Setting up Python environment for Ultimate Browsing ===");

try {
	// 1. Create directory if not exists
	mkdirSync(dirname(venvPath), { recursive: true });
} catch {}

function run(cmd, args = {}) {
	console.log(`> Running: ${cmd}`);
	execSync(cmd, { stdio: "inherit", ...args });
}

function dirname(path) {
	return path.split("/").slice(0, -1).join("/");
}

try {
	// 2. Create python venv
	if (!existsSync(venvPath)) {
		run(`python3 -m venv "${venvPath}"`);
	} else {
		console.log(`Python venv already exists at ${venvPath}`);
	}

	const pipBin = join(venvPath, "bin", "pip");
	const playwrightBin = join(venvPath, "bin", "playwright");

	// 3. Install packages
	console.log("Installing python packages (curl_cffi, playwright, yt-dlp)...");
	run(`"${pipBin}" install --upgrade pip`);
	run(`"${pipBin}" install curl_cffi playwright yt-dlp`);

	// 4. Install Playwright Chromium
	console.log("Installing Playwright Chromium browser binary...");
	run(`"${playwrightBin}" install chromium`);

	console.log("=== Ultimate Browsing environment setup complete! ===");
} catch (error) {
	console.error("Failed to setup browsing environment:", error);
	process.exit(1);
}
