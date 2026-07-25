#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanCjkSpacing } from "./clean-cjk-spacing.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2).filter(arg => arg !== "--clean");
const hwpFile = args[0];
const shouldClean = process.argv.includes("--clean");

if (!hwpFile) {
	console.error("Usage: node convert-hwp.mjs <relative_path_to_hwp> [--clean]");
	process.exit(1);
}

const targetPath = join(root, hwpFile);
if (!existsSync(targetPath)) {
	console.error(`File not found: ${targetPath}`);
	process.exit(1);
}

const cacheDir = join(root, ".omo", "hwp-cache");
try {
	mkdirSync(cacheDir, { recursive: true });
} catch {}

const outMarkdownPath = join(cacheDir, `${basename(hwpFile)}.md`);

console.log(`=== Parsing HWP Document: ${hwpFile} ===`);

let success = false;
let parsedText = "";

// 1. Try running kordoc via npx or global command
try {
	// kordoc <file> -o <outMarkdownPath>
	// Since kordoc parses HWP, HWPX, PDF, DOCX, XLSX, etc., we can run it via npx.
	execSync(`npx -y kordoc "${targetPath}" -o "${outMarkdownPath}"`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
	if (existsSync(outMarkdownPath)) {
		const fs = await import("node:fs");
		parsedText = fs.readFileSync(outMarkdownPath, "utf8");
		if (parsedText.trim().length > 0) {
			success = true;
			console.log("Successfully parsed using kordoc!");
		}
	}
} catch (e0) {
	console.warn("kordoc CLI is not available or failed. Trying native rhwp CLI fallback...");
}

// 2. Try running Rust-based rhwp CLI if installed in PATH or cargo
if (!success) {
	try {
		// rhwp export-markdown <file> -o <cacheDir>
		execSync(`rhwp export-markdown "${targetPath}" -o "${cacheDir}"`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
		
		// The CLI exports pages as markdown inside cacheDir
		// e.g. <cacheDir>/<basename>.md
		const expectedOut = join(cacheDir, `${basename(hwpFile).replace(/\.hwp(x)?$/, "")}.md`);
		if (existsSync(expectedOut)) {
			const fs = await import("node:fs");
			parsedText = fs.readFileSync(expectedOut, "utf8");
			fs.unlinkSync(expectedOut); // clean up intermediate file
			success = true;
			console.log("Successfully parsed using native rhwp CLI!");
		}
	} catch (e1) {
		console.warn("Native rhwp CLI is not available or failed. Trying Node.js binary strings fallback...");
	}
}

// 2. Fallback: Extract raw Korean UTF-16 / ASCII text fragments directly from binary file
if (!success) {
	try {
		const fs = await import("node:fs");
		const buffer = fs.readFileSync(targetPath);
		
		// Attempt to grab clean readable strings
		let unicodeStr = "";
		for (let i = 0; i < buffer.length - 1; i += 2) {
			const charCode = buffer.readUInt16LE(i);
			// Filter readable hangul, alphanumeric, and basic punctuation range
			if (
				(charCode >= 0xac00 && charCode <= 0xd7a3) || // Hangul syllables
				(charCode >= 0x1100 && charCode <= 0x11ff) || // Hangul Jamo
				(charCode >= 32 && charCode <= 126) ||        // Basic ASCII
				charCode === 10 || charCode === 13             // Newlines
			) {
				unicodeStr += String.fromCharCode(charCode);
			}
		}

		// Prune double newlines and non-printable noise
		parsedText = unicodeStr
			.replace(/[^\x20-\x7E\uAC00-\uD7A3\s]+/g, "")
			.replace(/\n\s*\n+/g, "\n\n")
			.trim();
		
		if (parsedText.length > 50) {
			success = true;
			parsedText = `# Raw Extracted Text from ${basename(hwpFile)}\n\n> [!NOTE]\n> Parsed using binary-string fallback.\n\n${parsedText}`;
			console.log("Successfully extracted text fragments using fallback binary extractor!");
		}
	} catch (fallbackError) {
		console.error("Binary fallback extractor failed:", fallbackError.message);
	}
}

if (success && parsedText) {
	writeFileSync(outMarkdownPath, parsedText, "utf8");
	console.log(`Saved parsed HWP content to: .omo/hwp-cache/${basename(hwpFile)}.md`);

	if (shouldClean) {
		const textToClean = readFileSync(outMarkdownPath, "utf8");
		const cleanedText = cleanCjkSpacing(textToClean);
		writeFileSync(outMarkdownPath, cleanedText, "utf8");
		console.log(`Successfully cleaned CJK spacing in: ${outMarkdownPath}`);
	}

	process.exit(0);
} else {
	console.error("Failed to extract any text from HWP file.");
	process.exit(1);
}
