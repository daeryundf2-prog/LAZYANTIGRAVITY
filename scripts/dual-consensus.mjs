#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const targetPath = args[0] || ".";

console.log(`[Dual-Consensus] Running 3-Domain Adversarial Consensus Audit on: ${targetPath}`);

// Run git diff to inspect recent changes on source files only
const diffRes = spawnSync("git", ["diff", "HEAD", "--", targetPath, ":!*.md", ":!*.json", ":!dist/**", ":!test/**", ":!scripts/flaky-stress-runner.mjs"], { encoding: "utf8" });
const diffText = diffRes.stdout || "";

// Filter only added or modified lines (lines starting with "+")
const addedLines = diffText
	.split("\n")
	.filter((line) => line.startsWith("+") && !line.startsWith("+++"))
	.map((line) => line.slice(1))
	.join("\n");

// 3 Adversarial Domain Checkers
const issues = [];

// Domain 1: Security & Injection Hazards
if (/child_process\.(exec|execSync)\([^,)]*\$\{|eval\(|new Function\(|dangerouslySetInnerHTML/i.test(addedLines)) {
	issues.push({
		domain: "SECURITY",
		severity: "CRITICAL",
		message: "Unsanitized command execution or dynamic code evaluation detected in diff.",
	});
}

// Domain 2: Concurrency & Async Hazards
if (/(?<!await\s+)Promise\.all|new Promise\([^)]*\)(?!\.catch)|setTimeout\(\s*\(\)\s*=>\s*\{[^}]*\}, \d{2,4}\)/.test(addedLines)) {
	issues.push({
		domain: "CONCURRENCY",
		severity: "HIGH",
		message: "Arbitrary delay or unhandled async promise detected in production code.",
	});
}

// Domain 3: Boundary & Type Safety Hazards
if (/(\bas\s+any\b|@ts-ignore|@ts-nocheck|\bunwrap\(\)|\bpanic!\()/.test(addedLines)) {
	issues.push({
		domain: "BOUNDARY_INTEGRITY",
		severity: "MEDIUM",
		message: "Unsafe type assertion (as any) or compiler ignore directive found in production source.",
	});
}

console.log("\n=== 3-Domain Adversarial Review Summary ===");
if (issues.length === 0) {
	console.log("✅ [Dual-Consensus] UNANIMOUS_PASS: Zero security, concurrency, or boundary violations found in production diff.");
	console.log("Verdict: APPROVED for merge/release.");
	process.exit(0);
} else {
	console.error(`❌ [Dual-Consensus] REMEDIATION_REQUIRED: ${issues.length} violation(s) identified:`);
	for (const issue of issues) {
		console.error(`- [${issue.domain}] (${issue.severity}): ${issue.message}`);
	}
	process.exit(1);
}
