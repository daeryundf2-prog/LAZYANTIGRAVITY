#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
let targetFile = "";
let testCommand = "npm test";
let threshold = 80; // Minimum acceptable mutation score %

for (let i = 0; i < args.length; i++) {
	if (args[i].startsWith("--test=")) {
		testCommand = args[i].slice("--test=".length);
	} else if (args[i].startsWith("--threshold=")) {
		threshold = parseInt(args[i].slice("--threshold=".length), 10) || 80;
	} else if (!targetFile) {
		targetFile = args[i];
	} else if (testCommand === "npm test") {
		testCommand = args[i];
	}
}

function parseCommand(cmd) {
	const parts = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < cmd.length; i++) {
		const ch = cmd[i];
		if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
		if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
		if (ch === " " && !inSingle && !inDouble) {
			if (current.length > 0) { parts.push(current); current = ""; }
			continue;
		}
		current += ch;
	}
	if (current.length > 0) parts.push(current);
	return parts;
}

function runCommand(cmd, opts) {
	if (process.platform === "win32") {
		return spawnSync(cmd, { ...opts, shell: true });
	}
	const parts = parseCommand(cmd);
	return spawnSync(parts[0], parts.slice(1), { ...opts, shell: false });
}

if (!targetFile || !existsSync(targetFile)) {
	console.error("Usage: node scripts/mutation-gate.mjs <targetSourceFile> [--test=\"npm test\"] [--threshold=80]");
	process.exit(1);
}

const originalSource = readFileSync(targetFile, "utf8");

// Guard: always restore the original source, even if the process is interrupted.
function restoreOriginal() {
	try {
		writeFileSync(targetFile, originalSource, "utf8");
	} catch {}
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
	process.on(signal, () => {
		restoreOriginal();
		process.exit(130);
	});
}

// Mutation operators (Syntactic & Semantic)
const mutationRules = [
	{ name: "Equality Replacement", from: /===/g, to: "!==" },
	{ name: "Inequality Replacement", from: /!==/g, to: "===" },
	{ name: "Logical AND to OR", from: /&&/g, to: "||" },
	{ name: "Logical OR to AND", from: /\|\|/g, to: "&&" },
	{ name: "Boolean Literal Inversion (true)", from: /\btrue\b/g, to: "false" },
	{ name: "Boolean Literal Inversion (false)", from: /\bfalse\b/g, to: "true" },
	{ name: "Comparison Greater to LessEq", from: />=/g, to: "<" },
	{ name: "Comparison Less to GreaterEq", from: /<=/g, to: ">" },
	{ name: "Arithmetic Addition to Subtraction", from: /\s\+\s/g, to: " - " },
	{ name: "Arithmetic Subtraction to Addition", from: /\s-\s/g, to: " + " },
	{ name: "Semantic Boundary Shift (0 to 1)", from: /\b0\b/g, to: "1" },
	{ name: "Semantic Boundary Shift (1 to 0)", from: /\b1\b/g, to: "0" },
	{ name: "Semantic Early Return Null", from: /return\s+([a-zA-Z0-9_$]+);/g, to: "return null;" }
];

console.log(`[Mutation-Gate] Target Source: ${targetFile}`);
console.log(`[Mutation-Gate] Test Command: "${testCommand}"`);
console.log(`[Mutation-Gate] Quality Gate Threshold: ${threshold}%`);

// Generate mutants
const mutants = [];
const lines = originalSource.split(/\r?\n/);

for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
	const line = lines[lineIndex];
	// Skip comments and imports
	if (/^\s*(\/\/|\/\*|\*|import|export\s+type)/.test(line)) continue;

	for (const rule of mutationRules) {
		// /g-flagged regexes keep a stateful lastIndex across test() calls;
		// reset so successive lines are not skipped and mutations are not missed.
		rule.from.lastIndex = 0;
		if (rule.from.test(line)) {
			rule.from.lastIndex = 0;
			const mutatedLine = line.replace(rule.from, rule.to);
			const mutatedLines = [...lines];
			mutatedLines[lineIndex] = mutatedLine;
			mutants.push({
				rule: rule.name,
				lineIndex: lineIndex + 1,
				originalLine: line.trim(),
				mutatedLine: mutatedLine.trim(),
				mutatedSource: mutatedLines.join("\n")
			});
		}
	}
}

if (mutants.length === 0) {
	console.log("[Mutation-Gate] ⚠️ No mutable operators found in target file. Skipping gate.");
	process.exit(0);
}

// Baseline sanity check: the test command must pass on the pristine source.
// Otherwise a broken suite would count every mutant as "killed" and report a false 100%.
console.log(`[Mutation-Gate] Baseline check: running "${testCommand}" on original source...`);
const baseline = runCommand(testCommand, { encoding: "utf8" });
if (baseline.status !== 0) {
	console.error("[Mutation-Gate] ❌ FAIL: Test command fails on the ORIGINAL source.");
	console.error("[Mutation-Gate]    Refusing to run mutants (results would be meaningless).");
	console.error((baseline.stderr || baseline.stdout || "").trim().split("\n").slice(0, 12).join("\n"));
	process.exit(1);
}
console.log("[Mutation-Gate] Baseline check passed.");

// Sample up to 10 mutants to keep verification fast
const sampledMutants = mutants.slice(0, 10);
console.log(`[Mutation-Gate] Generated ${mutants.length} total mutants (evaluating sample of ${sampledMutants.length})...\n`);

let killed = 0;
let survived = 0;
const survivingDetails = [];

try {
	for (let i = 0; i < sampledMutants.length; i++) {
		const mutant = sampledMutants[i];
		process.stdout.write(`\r[Mutation-Gate] Testing mutant ${i + 1}/${sampledMutants.length} (Line ${mutant.lineIndex}: ${mutant.rule})...`);

		// Apply mutation
		writeFileSync(targetFile, mutant.mutatedSource, "utf8");

		// Run test
		const res = runCommand(testCommand, { encoding: "utf8" });

		if (res.status !== 0) {
			// Test failed -> Mutant was caught/killed (GOOD)
			killed++;
		} else {
			// Test passed -> Mutant survived (BAD / Weak test)
			survived++;
			survivingDetails.push(mutant);
		}
	}
} finally {
	// Restore original source always (signals are handled by restoreOriginal above)
	restoreOriginal();
}

console.log("\n");
const totalTested = killed + survived;
const score = Number(((killed / totalTested) * 100).toFixed(1));

console.log("=== Mutation Testing Results ===");
console.log(`Mutants Killed (Tests caught defect): ${killed}`);
console.log(`Mutants Survived (Tests failed to catch): ${survived}`);
console.log(`Mutation Score: ${score}% (Threshold: ${threshold}%)`);

if (survived > 0) {
	console.log("\n⚠️ Surviving Mutants (Gaps in test assertions):");
	for (const s of survivingDetails) {
		console.log(`- Line ${s.lineIndex} [${s.rule}]:`);
		console.log(`    Before: ${s.originalLine}`);
		console.log(`    After:  ${s.mutatedLine}`);
	}
}

if (score >= threshold) {
	console.log(`\n✅ [Mutation-Gate] PASS: Test suite passed mutation resilience check (${score}% >= ${threshold}%).`);
	process.exit(0);
} else {
	console.error(`\n❌ [Mutation-Gate] FAIL: Mutation score ${score}% is below required ${threshold}%. Strengthen test assertions!`);
	process.exit(1);
}
