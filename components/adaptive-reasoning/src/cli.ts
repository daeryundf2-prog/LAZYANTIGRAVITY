#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { handleUserPromptSubmitHook } from "./codex-hook.js";
import { computeThinkingBudget, formatThinkingBudgetDirective } from "./budget-scaler.js";
import { skeletonizeCode } from "./skeletonizer.js";

const args = process.argv.slice(2);
const command = args[0];

if (command === "hook" && args[1] === "user-prompt-submit") {
	let input = "";
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", (chunk) => {
		input += chunk;
	});
	process.stdin.on("end", () => {
		const output = handleUserPromptSubmitHook(input);
		process.stdout.write(output);
	});
} else if (command === "budget") {
	const prompt = args.slice(1).join(" ");
	const decision = computeThinkingBudget(prompt);
	console.log(formatThinkingBudgetDirective(decision));
} else if (command === "skeletonize") {
	const filepath = args[1];
	if (!filepath) {
		console.error("Usage: lazyantigravity-adaptive-reasoning skeletonize <filepath>");
		process.exit(1);
	}
	const content = readFileSync(filepath, "utf8");
	const result = skeletonizeCode(content, filepath);
	console.log(`/* Skeletonized: ${filepath} (${result.originalLength}B -> ${result.skeletonLength}B, ${(result.compressionRatio * 100).toFixed(0)}%) */`);
	console.log(result.skeleton);
} else {
	console.log("LazyAntigravity Adaptive Reasoning CLI");
	console.log("Commands: hook user-prompt-submit | budget <prompt> | skeletonize <file>");
}
