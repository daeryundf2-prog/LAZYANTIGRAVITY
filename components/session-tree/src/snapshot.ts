import { spawnSync } from "node:child_process";

export function runGit(cmdArgs: string[], cwd: string = process.cwd(), throwOnError = true): string {
	const res = spawnSync("git", cmdArgs, { cwd, encoding: "utf8" });
	if (res.status !== 0 && throwOnError) {
		throw new Error(res.stderr.trim() || res.stdout.trim() || `Git failed: git ${cmdArgs.join(" ")}`);
	}
	return (res.stdout || "").trim();
}

export function createShadowSnapshot(label: string, cwd: string = process.cwd()): string {
	// 1. Stage temporary index in memory without touching HEAD
	const treeSha = runGit(["write-tree"], cwd);

	// 2. Commit tree with parent HEAD
	let headSha = "";
	try {
		headSha = runGit(["rev-parse", "HEAD"], cwd);
	} catch {
		headSha = "";
	}

	const commitArgs = ["commit-tree", treeSha, "-m", `shadow: ${label}`];
	if (headSha) {
		commitArgs.push("-p", headSha);
	}

	const commitSha = runGit(commitArgs, cwd);

	// 3. Save as shadow ref
	const refName = `refs/lazyantigravity/snapshots/${commitSha.slice(0, 8)}`;
	runGit(["update-ref", refName, commitSha], cwd);

	return commitSha;
}

export function restoreShadowSnapshot(commitSha: string, cwd: string = process.cwd()): void {
	// Checkout tree without changing branch
	runGit(["read-tree", "-u", "--reset", commitSha], cwd);
}
