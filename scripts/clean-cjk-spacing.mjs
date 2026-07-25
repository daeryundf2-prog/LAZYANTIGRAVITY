#!/usr/bin/env node
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Cleans CJK spacing in the given text.
 * @param {string} text
 * @returns {string}
 */
export function cleanCjkSpacing(text) {
	if (typeof text !== "string") return "";

	// Unicode NFC Normalization
	text = text.normalize("NFC");

	// Whitespace Collapsing
	// Collapse sequential spaces/tabs to a single space
	text = text.replace(/[ \t]+/g, " ");
	// Trim line borders
	text = text.split("\n").map(line => line.trim()).join("\n");
	// Collapse multiple empty lines (\n{3,}) to \n\n
	text = text.replace(/\n{3,}/g, "\n\n");

	// Chinese and Japanese space stripping
	const cjChar = '[\\u4e00-\\u9fa5\\u3040-\\u309f\\u30a0-\\u30ff]';
	const cjRegex = new RegExp(`(${cjChar})\\s+(?=${cjChar})`, 'g');
	text = text.replace(cjRegex, '$1');

	// Korean Hangul spacing heuristic (handles Unicode word boundaries correctly)
	const hangulChar = '[\\uac00-\\ud7a3]';
	const workingSequenceRegex = new RegExp(`(?<!${hangulChar})(${hangulChar})\\s+(${hangulChar})\\s+(${hangulChar})\\s+(${hangulChar})(?:\\s+${hangulChar})*(?!${hangulChar})`, 'g');
	text = text.replace(workingSequenceRegex, (match) => match.replace(/\s+/g, ''));

	// Inter-script space formatting
	text = text.replace(/([\u4e00-\u9fa5\uac00-\ud7a3])([A-Za-z0-9])/g, '$1 $2');
	text = text.replace(/([A-Za-z0-9])([\u4e00-\u9fa5\uac00-\ud7a3])/g, '$1 $2');

	return text;
}

// CLI Execution support
if (process.argv[1]) {
	try {
		const mainPath = realpathSync(process.argv[1]);
		const currentPath = realpathSync(fileURLToPath(import.meta.url));
		if (mainPath === currentPath) {
			const filePath = process.argv[2];
			if (!filePath) {
				console.error("Usage: node clean-cjk-spacing.mjs <file_path>");
				process.exit(1);
			}
			const text = readFileSync(filePath, "utf8");
			const cleaned = cleanCjkSpacing(text);
			writeFileSync(filePath, cleaned, "utf8");
			console.log(`Successfully cleaned CJK spacing in: ${filePath}`);
		}
	} catch (e) {
		// Ignore check errors if importing in environments without full filesystem access
	}
}
