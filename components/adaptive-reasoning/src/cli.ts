#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { handleUserPromptSubmitHook } from "./codex-hook.js";
import { computeThinkingBudget, formatThinkingBudgetDirective } from "./budget-scaler.js";
import { skeletonizeCode } from "./skeletonizer.js";
import { computeUncertainty, formatUncertaintyDirective, evaluateHypothesisEntropy } from "./uncertainty.js";

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
} else if (command === "uncertainty") {
	const prompt = args.slice(1).join(" ");
	const evaluation = computeUncertainty(prompt);
	if (args.includes("--json")) {
		console.log(JSON.stringify(evaluation, null, 2));
	} else {
		console.log(`Uncertainty Score: ${evaluation.score} (${evaluation.level})`);
		console.log(`Trigger Search: ${evaluation.triggerSearch}`);
		console.log(`Reasons: ${evaluation.reasons.join("; ")}`);
		if (evaluation.triggerSearch) {
			console.log("\n" + formatUncertaintyDirective(evaluation));
		}
	}
} else if (command === "entropy") {
	const paths = args.slice(1).filter((a) => !a.startsWith("--"));
	const evaluation = evaluateHypothesisEntropy(paths);
	if (args.includes("--json")) {
		console.log(JSON.stringify(evaluation, null, 2));
	} else {
		console.log(`Multi-Path Entropy: ${evaluation.entropy} (Paths: ${evaluation.pathCount})`);
		console.log(`Agreement Ratio: ${(evaluation.agreementRatio * 100).toFixed(0)}%`);
		console.log(`Conflicting: ${evaluation.conflicting}`);
		console.log(`Trigger Search: ${evaluation.triggerSearch}`);
		console.log(`Reasons: ${evaluation.reasons.join("; ")}`);
	}
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
	console.log("Commands: hook user-prompt-submit | budget <prompt> | uncertainty <prompt> | entropy <path1> <path2>... | skeletonize <file>");
}
