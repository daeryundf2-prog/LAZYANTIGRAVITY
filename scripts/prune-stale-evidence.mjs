#!/usr/bin/env node
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
const evidenceDir = join(root, ".omo", "ulw-loop", "evidence");

console.log(`=== Pruning stale evidence files modified > 24 hours ago in ${evidenceDir} ===`);

const STALE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const now = Date.now();

try {
	const files = readdirSync(evidenceDir);
	let pruneCount = 0;
	
	for (const file of files) {
		if (file === ".gitkeep") continue;
		const filePath = join(evidenceDir, file);
		try {
			const stats = statSync(filePath);
			const age = now - stats.mtimeMs;
			if (age > STALE_AGE_MS) {
				unlinkSync(filePath);
				console.log(`Pruned stale file: ${file} (modified ${Math.round(age / (60 * 60 * 1000))} hours ago)`);
				pruneCount++;
			}
		} catch (err) {
			console.error(`Failed to process file ${file}:`, err.message);
		}
	}
	console.log(`=== Pruning complete! Cleaned ${pruneCount} stale files. ===`);
} catch (error) {
	if (error.code === "ENOENT") {
		console.log("No evidence directory found. Nothing to prune.");
	} else {
		console.error("Pruning failed:", error);
	}
}
