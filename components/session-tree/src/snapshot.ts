import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function runGit(cmdArgs: string[], cwd: string = process.cwd(), throwOnError = true, extraEnv: Record<string, string> = {}): string {
	const env = Object.keys(extraEnv).length > 0 ? { ...process.env, ...extraEnv } : process.env;
	const res = spawnSync("git", cmdArgs, { cwd, encoding: "utf8", env });
	if (res.status !== 0 && throwOnError) {
		throw new Error(res.stderr.trim() || res.stdout.trim() || `Git failed: git ${cmdArgs.join(" ")}`);
	}
	return (res.stdout || "").trim();
}

export function createShadowSnapshot(label: string, cwd: string = process.cwd()): string {
	// Stage the full working tree (including untracked files) into a temporary
	// index so the user's real index is never touched, then commit that tree as
	// a shadow ref. Without this, `write-tree` alone would snapshot only the
	// stale index and silently miss unstaged/untracked edits.
	const tempIndexDir = mkdtempSync(join(tmpdir(), "lazyantigravity-idx-"));
	const tempIndex = join(tempIndexDir, "index");
	try {
		const gitEnv = { GIT_INDEX_FILE: tempIndex };
		const headTree = runGit(["rev-parse", "HEAD^{tree}"], cwd, false, gitEnv);
		if (headTree) {
			runGit(["read-tree", headTree], cwd, true, gitEnv);
		}
		runGit(["add", "-A", "--", "."], cwd, true, gitEnv);
		const treeSha = runGit(["write-tree"], cwd, true, gitEnv);

		// Commit tree with parent HEAD
		let headSha = "";
		try {
			headSha = runGit(["rev-parse", "HEAD"], cwd, false);
		} catch {
			headSha = "";
		}

		const commitArgs = ["commit-tree", treeSha, "-m", `shadow: ${label}`];
		if (headSha) {
			commitArgs.push("-p", headSha);
		}

		const commitSha = runGit(commitArgs, cwd);

		// Save as shadow ref
		const refName = `refs/lazyantigravity/snapshots/${commitSha.slice(0, 8)}`;
		runGit(["update-ref", refName, commitSha], cwd);

		return commitSha;
	} finally {
		rmSync(tempIndexDir, { recursive: true, force: true });
	}
}

export function restoreShadowSnapshot(commitSha: string, cwd: string = process.cwd()): void {
	// Checkout tree without changing branch
	runGit(["read-tree", "-u", "--reset", commitSha], cwd);
}
