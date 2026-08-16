#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0];
const agentId = args[1] || `agent-${Date.now().toString(36)}`;

const SAFE_AGENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
if (!SAFE_AGENT_ID.test(agentId)) {
	console.error(`[Worktree-Swarm] Invalid agentId: "${agentId}". Must match ${SAFE_AGENT_ID}`);
	process.exit(1);
}

const worktreeBase = join(process.cwd(), ".lazyantigravity", "worktrees");

function runGit(cmdArgs, cwd = process.cwd(), throwOnError = true) {
	const res = spawnSync("git", cmdArgs, { cwd, encoding: "utf8" });
	if (res.status !== 0 && throwOnError) {
		throw new Error(res.stderr.trim() || res.stdout.trim() || `Git command failed: git ${cmdArgs.join(" ")}`);
	}
	return (res.stdout || "").trim();
}

function getWorktreeList() {
	const out = runGit(["worktree", "list", "--porcelain"], process.cwd(), false);
	const worktrees = [];
	let current = {};
	for (const line of out.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current.worktree) worktrees.push(current);
			current = { worktree: line.slice("worktree ".length).trim() };
		} else if (line.startsWith("branch ")) {
			current.branch = line.slice("branch ".length).trim();
		} else if (line.startsWith("HEAD ")) {
			current.head = line.slice("HEAD ".length).trim();
		}
	}
	if (current.worktree) worktrees.push(current);
	return worktrees;
}

try {
	if (command === "create") {
		if (!existsSync(worktreeBase)) {
			mkdirSync(worktreeBase, { recursive: true });
		}
		const worktreePath = resolve(worktreeBase, agentId);
		const branchName = `swarm/${agentId}`;

		console.log(`[Worktree-Swarm] Creating isolated worktree at: ${worktreePath}`);
		// Detach or create new branch from HEAD
		runGit(["worktree", "add", "-b", branchName, worktreePath, "HEAD"]);
		console.log(`[Worktree-Swarm] ✅ Created worktree on branch "${branchName}" at ${worktreePath}`);
		console.log(JSON.stringify({ agentId, worktreePath, branchName }));
	} else if (command === "merge") {
		const worktreePath = resolve(worktreeBase, agentId);
		const branchName = `swarm/${agentId}`;

		console.log(`[Worktree-Swarm] Merging worktree changes from "${branchName}"...`);
		if (existsSync(worktreePath)) {
			// Stage any changes inside worktree
			try {
				runGit(["add", "."], worktreePath, false);
				const status = runGit(["status", "--porcelain"], worktreePath, false);
				if (status) {
					runGit(["commit", "-m", `swarm: isolated changes from ${agentId}`], worktreePath, false);
				}
			} catch (e) {
				// No changes to commit
			}
		}

		// Squash merge into current branch
		try {
			runGit(["merge", "--squash", branchName]);
			console.log(`[Worktree-Swarm] ✅ Successfully squash-merged "${branchName}" into current working tree.`);
		} finally {
			// Complete clean removal of worktree and branch
			runGit(["worktree", "remove", "--force", worktreePath], process.cwd(), false);
			runGit(["branch", "-D", branchName], process.cwd(), false);
			runGit(["worktree", "prune"], process.cwd(), false);
			if (existsSync(worktreePath)) {
				rmSync(worktreePath, { recursive: true, force: true });
			}
		}
	} else if (command === "cleanup") {
		console.log("[Worktree-Swarm] Cleaning up all swarm worktrees and branches...");
		const worktrees = getWorktreeList();
		const rootPath = resolve(process.cwd());

		for (const wt of worktrees) {
			const wtPath = resolve(wt.worktree);
			if (wtPath !== rootPath && (wtPath.includes(".lazyantigravity/worktrees") || wtPath.includes(".lazyantigravity\\worktrees"))) {
				console.log(`[Worktree-Swarm] Removing worktree: ${wtPath}`);
				runGit(["worktree", "remove", "--force", wtPath], process.cwd(), false);
			}
		}

		// Prune dead worktree refs in git metadata
		runGit(["worktree", "prune"], process.cwd(), false);

		// Remove all swarm branches
		const branchList = runGit(["branch", "--list", "swarm/*"], process.cwd(), false);
		if (branchList) {
			for (const b of branchList.split("\n")) {
				const branchName = b.replace(/^[*+ ]+/, "").trim();
				if (branchName) {
					console.log(`[Worktree-Swarm] Deleting branch: ${branchName}`);
					runGit(["branch", "-D", branchName], process.cwd(), false);
				}
			}
		}

		// Ensure directory is completely removed
		if (existsSync(worktreeBase)) {
			rmSync(worktreeBase, { recursive: true, force: true });
		}
		console.log("[Worktree-Swarm] ✅ Swarm worktrees and metadata completely cleaned.");
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
