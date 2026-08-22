#!/usr/bin/env node
/**
 * Self-Audit Engine: Trajectory Ledger & Atomic Rollback CLI
 * 
 * Usage:
 *   node scripts/self-audit.mjs [--rollback] [--hard] [--json]
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = process.env.OMO_REPO_ROOT?.trim() || process.cwd();
const args = process.argv.slice(2);
const isRollback = args.includes("--rollback");
const isHard = args.includes("--hard");
const isJson = args.includes("--json");

function runGit(cmd) {
	try {
		return execSync(`git ${cmd}`, { cwd, encoding: "utf8" }).trim();
	} catch (err) {
		return "";
	}
}

function getAuditReport() {
	const status = runGit("status --short");
	const recentLogs = runGit("log -n 5 --oneline");
	const currentBranch = runGit("branch --show-current") || "HEAD";
	const diffStat = runGit("diff --stat");

	const changedFiles = status
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const parts = line.split(/\s+/);
			return {
				status: parts[0],
				path: parts.slice(1).join(" "),
			};
		});

	return {
		branch: currentBranch,
		changed_files_count: changedFiles.length,
		changed_files: changedFiles,
		recent_commits: recentLogs.split("\n").filter(Boolean),
		diff_stat: diffStat,
		timestamp: new Date().toISOString(),
	};
}

const report = getAuditReport();

if (isRollback) {
	if (isHard) {
		runGit("reset --hard HEAD~1");
		console.log("LazyAntigravity Self-Audit: Executed atomic hard rollback to HEAD~1.");
	} else {
		runGit("restore .");
		console.log("LazyAntigravity Self-Audit: Restored all uncommitted modified working files.");
	}
} else if (isJson) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log("================================================================");
	console.log("           LazyAntigravity: Self-Audit Ledger Report           ");
	console.log("================================================================");
	console.log(`Current Branch : ${report.branch}`);
	console.log(`Changed Files  : ${report.changed_files_count}`);
	if (report.changed_files.length > 0) {
		console.log("\n[Modified / Untracked Files]:");
		for (const f of report.changed_files) {
			console.log(`  [${f.status}] ${f.path}`);
		}
	}
	console.log("\n[Recent 5 Commits]:");
	for (const c of report.recent_commits) {
		console.log(`  * ${c}`);
	}
	console.log("================================================================");
	console.log("To rollback working tree : node scripts/self-audit.mjs --rollback");
	console.log("To undo latest commit    : node scripts/self-audit.mjs --rollback --hard");
	console.log("================================================================");
}
