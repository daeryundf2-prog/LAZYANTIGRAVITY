#!/usr/bin/env node

import { cp, mkdir, writeFile } from "node:fs/promises";
import { lstatSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);

if (args[0] !== "install") {
	console.log("Usage: lazyantigravity install");
	process.exit(1);
}

async function install() {
	console.log("Starting LazyAntigravity installation for Google Antigravity...");

	// 1. Build workspaces/components in plugins/omo
	console.log("Building plugin components...");
	const buildResult = spawnSync("npm", ["run", "build"], {
		cwd: join(rootDir, "plugins", "omo"),
		shell: process.platform === "win32",
		stdio: "inherit",
	});

	if (buildResult.error) {
		console.error("Error launching build:", buildResult.error.message);
		process.exit(1);
	}
	if (buildResult.status !== 0) {
		console.error("Build failed with status code:", buildResult.status);
		process.exit(buildResult.status ?? 1);
	}

	// 2. Setup target folders in .gemini config
	const geminiHome = process.env.GEMINI_HOME || join(homedir(), ".gemini");
	const targetPluginDir = join(geminiHome, "config", "plugins", "lazyantigravity");

	console.log(`Deploying plugin to: ${targetPluginDir}`);
	await mkdir(targetPluginDir, { recursive: true });

	// 3. Copy files from plugins/omo to ~/.gemini/config/plugins/lazyantigravity
	console.log("Copying files to plugin directory...");
	const sourceDir = join(rootDir, "plugins", "omo");
	
	await cp(sourceDir, targetPluginDir, {
		recursive: true,
		filter: (src) => {
			if (src.includes("package-lock.json") || src.includes(".codex-plugin")) {
				return false;
			}
			if (src.includes("node_modules\\@code-yeongyu") || src.includes("node_modules/@code-yeongyu")) {
				return false;
			}
			if (src.includes("node_modules\\@sisyphuslabs") || src.includes("node_modules/@sisyphuslabs")) {
				return false;
			}
			try {
				const stat = lstatSync(src);
				if (stat.isSymbolicLink()) {
					return false;
				}
			} catch (e) {
				// ignore
			}
			return true;
		}
	});

	// 4. Write/copy manifest, mcp, hooks to root of target directory
	console.log("Configuring plugin manifests...");
	
	// Copy .mcp.json to mcp_config.json
	await cp(join(sourceDir, ".mcp.json"), join(targetPluginDir, "mcp_config.json"));
	
	// Copy hooks/hooks.json to hooks.json
	await cp(join(sourceDir, "hooks", "hooks.json"), join(targetPluginDir, "hooks.json"));

	// 5. Write runtime hint for adapter detection
	const runtimeHint = { target: "antigravity", installedAt: new Date().toISOString() };
	await writeFile(
		join(targetPluginDir, ".runtime-hint.json"),
		JSON.stringify(runtimeHint, null, 2) + "\n"
	);

	console.log("LazyAntigravity successfully installed!");
	console.log(`Verify the plugin is active in your Antigravity environment.`);
}

install().catch((error) => {
	console.error("Installation failed:", error);
	process.exit(1);
});
