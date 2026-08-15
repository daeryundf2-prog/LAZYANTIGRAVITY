#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { skeletonizeCode } from "../components/adaptive-reasoning/dist/skeletonizer.js";

const file = process.argv[2];
if (!file || !existsSync(file)) {
	console.error("Usage: node scripts/ast-skeletonizer.mjs <filepath>");
	process.exit(1);
}

const content = readFileSync(file, "utf8");
const result = skeletonizeCode(content, file);

console.log(`/* Skeletonized: ${file} (${result.originalLength}B -> ${result.skeletonLength}B, ${(result.compressionRatio * 100).toFixed(0)}%) */`);
console.log(result.skeleton);
