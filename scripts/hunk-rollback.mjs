#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");

console.log("=== Non-Interactive Hunk-Based Rollback Utility ===");

const targetFile = process.argv[2];
const errorLineNum = parseInt(process.argv[3], 10);

if (!targetFile || isNaN(errorLineNum)) {
	console.error("Usage: node hunk-rollback.mjs <target_file_relative_path> <error_line_number>");
	process.exit(1);
}

try {
	// 1. Get raw diff for the file
	const diffRaw = execSync(`git diff -U0 "${join(root, targetFile)}"`, { cwd: root, shell: process.platform === "win32", encoding: "utf8" });
	if (!diffRaw.trim()) {
		console.log("No changes detected in target file.");
		process.exit(0);
	}

	// 2. Parse diff to find which hunk contains the error line
	const lines = diffRaw.split("\n");
	let currentHeader = null;
	let currentHunkLines = [];
	let matchingHunkText = null;

	const headerRegex = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

	for (const line of lines) {
		if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
			currentHunkLines.push(line);
			continue;
		}

		const match = line.match(headerRegex);
		if (match) {
			if (currentHeader && matchesErrorLine(currentHeader, errorLineNum)) {
				matchingHunkText = currentHunkLines.join("\n") + "\n";
				break;
			}
			// Reset for new hunk
			currentHeader = {
				startLine: parseInt(match[2], 10),
				count: match[2].includes(",") ? parseInt(match[2].split(",")[1], 10) : 1
			};
			currentHunkLines = [...currentHunkLines.slice(0, 4)]; // Keep git headers
			currentHunkLines.push(line);
		} else {
			currentHunkLines.push(line);
		}
	}

	// Check final hunk
	if (!matchingHunkText && currentHeader && matchesErrorLine(currentHeader, errorLineNum)) {
		matchingHunkText = currentHunkLines.join("\n") + "\n";
	}

	function matchesErrorLine(header, errorLine) {
		const start = header.startLine;
		const end = start + header.count;
		return errorLine >= start && errorLine <= end;
	}

	if (!matchingHunkText) {
		console.log(`No modified hunk spans across error line ${errorLineNum}.`);
		process.exit(0);
	}

	// 3. Write hunk diff to a temporary file
	const tmpDiffPath = join(root, `.tmp-rollback-${Date.now()}.diff`);
	writeFileSync(tmpDiffPath, matchingHunkText, "utf8");

	// 4. Run git apply -R to revert only this hunk
	try {
		console.log(`Reverting hunk containing error line ${errorLineNum} in ${targetFile}...`);
		execSync(`git apply -R "${tmpDiffPath}"`, { cwd: root, shell: process.platform === "win32" });
		console.log("Successfully rolled back the failing hunk!");
	} finally {
		unlinkSync(tmpDiffPath);
	}

} catch (error) {
	console.error("Rollback failed:", error.message);
	process.exit(1);
}
