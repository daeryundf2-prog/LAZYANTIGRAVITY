import crypto from "node:crypto";

/**
 * Compute 2-character uppercase hash for a line of text.
 * Uses SHA-256 truncated to 2 base36/uppercase characters.
 * @param {string} line
 * @returns {string} 2-char hash tag
 */
export function computeLineHash(line) {
  const hash = crypto.createHash("sha256").update(line.trim()).digest("hex");
  const num = parseInt(hash.slice(0, 4), 16);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return chars[num % chars.length] + chars[Math.floor(num / chars.length) % chars.length];
}

/**
 * Format file text into Hashline tagged output: "LINE#HASH| CONTENT"
 * @param {string} text
 * @returns {string}
 */
export function formatHashlineText(text) {
  const lines = text.split("\n");
  return lines
    .map((line, idx) => {
      const lineNum = idx + 1;
      const hash = computeLineHash(line);
      return `${lineNum}#${hash}| ${line}`;
    })
    .join("\n");
}

/**
 * Validate that a target line tag matches the current file line content hash.
 * @param {string} fileText
 * @param {number} lineNumber 1-indexed line number
 * @param {string} expectedHash 2-char hash tag
 * @returns {{ valid: boolean, actualHash: string, lineContent: string }}
 */
export function validateLineHash(fileText, lineNumber, expectedHash) {
  const lines = fileText.split("\n");
  const lineContent = lines[lineNumber - 1] ?? "";
  const actualHash = computeLineHash(lineContent);
  const valid = actualHash.toUpperCase() === expectedHash.toUpperCase();
  return { valid, actualHash, lineContent };
}
