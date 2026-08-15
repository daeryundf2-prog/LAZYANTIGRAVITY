#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const command = args[0];
const agentId = args[1] || `agent-${Date.now().toString(36)}`;
const worktreeBase = join(process.cwd(), ".lazyantigravity", "worktrees");

function runGit(cmdArgs, cwd = process.cwd()) {
	const res = spawnSync("git", cmdArgs, { cwd, encoding: "utf8" });
	if (res.status !== 0) {
		throw new Error(res.stderr.trim() || res.stdout.trim() || `Git command failed: git ${cmdArgs.join(" ")}`);
	}
	return res.stdout.trim();
}

try {
	if (command === "create") {
		if (!existsSync(worktreeBase)) {
			mkdirSync(worktreeBase, { recursive: true });
		}
		const worktreePath = join(worktreeBase, agentId);
		const branchName = `swarm/${agentId}`;

		console.log(`[Worktree-Swarm] Creating isolated worktree at: ${worktreePath}`);
		// Detach or create new branch from HEAD
		runGit(["worktree", "add", "-b", branchName, worktreePath, "HEAD"]);
		console.log(`[Worktree-Swarm] ✅ Created worktree on branch "${branchName}" at ${worktreePath}`);
		console.log(JSON.stringify({ agentId, worktreePath, branchName }));
	} else if (command === "merge") {
		const worktreePath = join(worktreeBase, agentId);
		const branchName = `swarm/${agentId}`;

		console.log(`[Worktree-Swarm] Merging worktree changes from "${branchName}"...`);
		if (existsSync(worktreePath)) {
			// Stage any changes inside worktree
			try {
				runGit(["add", "."], worktreePath);
				const status = runGit(["status", "--porcelain"], worktreePath);
				if (status) {
					runGit(["commit", "-m", `swarm: isolated changes from ${agentId}`], worktreePath);
				}
			} catch (e) {
				// No changes to commit
			}
		}

		// Cherry-pick or squash merge into current branch
		try {
			runGit(["merge", "--squash", branchName]);
			console.log(`[Worktree-Swarm] ✅ Successfully squash-merged "${branchName}" into current working tree.`);
		} finally {
			// Remove worktree
			try {
				runGit(["worktree", "remove", "-f", worktreePath]);
				runGit(["branch", "-D", branchName]);
			} catch (e) {
				// Cleanup best-effort
			}
		}
	} else if (command === "cleanup") {
		console.log("[Worktree-Swarm] Cleaning up all swarm worktrees...");
		try {
			runGit(["worktree", "prune"]);
			if (existsSync(worktreeBase)) {
				rmSync(worktreeBase, { recursive: true, force: true });
			}
			console.log("[Worktree-Swarm] ✅ Swarm worktrees cleaned.");
		} catch (err) {
			console.error("[Worktree-Swarm] Prune error:", err.message);
		}
	} else if (command === "list") {
		const output = runGit(["worktree", "list"]);
		console.log(output);
	} else {
		console.log("Usage: node scripts/worktree-swarm.mjs <create|merge|cleanup|list> [agentId]");
	}
} catch (err) {
	console.error(`[Worktree-Swarm] Error: ${err.message}`);
	process.exit(1);
}
