import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0];
const filePathArg = args[1];

if (!command || (command !== "stats" && command !== "compress")) {
  console.error("Usage: node caveman-helper.mjs [stats | compress] <filePath>");
  process.exit(1);
}

if (!filePathArg) {
  console.error("Missing file path.");
  process.exit(1);
}

const filePath = resolve(process.cwd(), filePathArg);

if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const originalText = readFileSync(filePath, "utf8");

if (command === "stats") {
  const chars = originalText.length;
  const words = originalText.split(/\s+/).filter(Boolean).length;
  const approxTokens = Math.ceil(chars / 4.1);
  console.log(`Original Stats for ${filePathArg}:`);
  console.log(`- Characters: ${chars}`);
  console.log(`- Words: ${words}`);
  console.log(`- Approx Tokens: ${approxTokens}`);
} else if (command === "compress") {
  // Simple telegraphic compression rules
  const fillers = new Set([
    "the", "a", "an", "is", "are", "am", "was", "were", "be", "been", "being",
    "there", "here", "would", "could", "should", "please", "kindly", "certainly",
    "sure", "hello", "hi", "greetings", "thanks", "thank", "you", "i", "we", "he",
    "she", "they", "it", "of", "to", "for", "with"
  ]);

  const lines = originalText.split("\n");
  const compressedLines = lines.map((line) => {
    // If it's a markdown header or code block boundary, keep it intact
    if (line.startsWith("#") || line.startsWith("```") || line.startsWith("-") || line.trim() === "") {
      return line;
    }
    // Remove filler words, keep structure
    const words = line.split(" ");
    const filtered = words.filter((w) => !fillers.has(w.toLowerCase().replace(/[^a-z]/i, "")));
    return filtered.join(" ");
  });

  const compressedText = compressedLines.join("\n");
  writeFileSync(filePath, compressedText, "utf8");
  console.log(`Compressed ${filePathArg} successfully.`);
  console.log(`- Original characters: ${originalText.length}`);
  console.log(`- Compressed characters: ${compressedText.length}`);
}
