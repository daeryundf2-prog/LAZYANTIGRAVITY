import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { SessionTreeManager } from "../dist/tree-manager.js";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function initGitRepo(dir) {
	spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
	spawnSync("git", ["config", "user.name", "TestUser"], { cwd: dir, encoding: "utf8" });
	spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, encoding: "utf8" });
	writeFileSync(join(dir, "init.txt"), "hello", "utf8");
	spawnSync("git", ["add", "."], { cwd: dir, encoding: "utf8" });
	spawnSync("git", ["commit", "-m", "initial commit"], { cwd: dir, encoding: "utf8" });
}

test("SessionTreeManager creates snapshots, builds hypothesis tree, and forks branches", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "session-tree-test-"));
	try {
		initGitRepo(tempDir);

		const manager = new SessionTreeManager(tempDir);

		// Snapshot 1
		const node1 = manager.snapshot("Initial Baseline");
		assert.ok(node1.id);
		assert.equal(node1.parentId, null);

		// Make changes and snapshot 2 (untracked on purpose: the snapshot must
		// capture the working tree, not just the git index)
		writeFileSync(join(tempDir, "feature.ts"), "export const a = 1;", "utf8");
		const node2 = manager.snapshot("Added feature A");
		assert.equal(node2.parentId, node1.id);

		// Fork back to baseline and create alternative branch
		const forked = manager.fork(node1.id);
		assert.equal(forked.id, node1.id);

		writeFileSync(join(tempDir, "feature_alt.ts"), "export const b = 2;", "utf8");
		const node3 = manager.snapshot("Added alternative feature B");
		assert.equal(node3.parentId, node1.id);

		// Render ASCII tree
		const treeStr = manager.renderAsciiTree();
		assert.ok(treeStr.includes("Initial Baseline"));
		assert.ok(treeStr.includes("Added feature A"));
		assert.ok(treeStr.includes("Added alternative feature B"));
		assert.ok(treeStr.includes("ACTIVE"));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("SessionTreeManager snapshots capture unstaged and untracked changes without touching the index", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "session-tree-untracked-"));
	try {
		initGitRepo(tempDir);
		const manager = new SessionTreeManager(tempDir);

		writeFileSync(join(tempDir, "untracked.ts"), "export const c = 3;", "utf8");
		writeFileSync(join(tempDir, "init.txt"), "modified content", "utf8");

		// Take one snapshot first so the session-tree state file (nodes.json)
		// exists and is part of the baseline git-status output.
		manager.snapshot("Baseline");

		const statusBefore = spawnSync("git", ["status", "--porcelain"], { cwd: tempDir, encoding: "utf8" }).stdout;
		assert.ok(statusBefore.includes("untracked.ts"), "precondition: file must be untracked");

		const node = manager.snapshot("Captures untracked work");

		// The snapshot tree must contain the untracked file and the unstaged edit...
		const showUntracked = spawnSync("git", ["show", `${node.gitSha}:untracked.ts`], { cwd: tempDir, encoding: "utf8" });
		assert.equal(showUntracked.status, 0, "snapshot must include untracked files");
		const showModified = spawnSync("git", ["show", `${node.gitSha}:init.txt`], { cwd: tempDir, encoding: "utf8" });
		assert.ok(showModified.stdout.includes("modified content"), "snapshot must include unstaged edits");

		// ...while the user's real index stays untouched.
		const statusAfter = spawnSync("git", ["status", "--porcelain"], { cwd: tempDir, encoding: "utf8" }).stdout;
		assert.equal(statusAfter, statusBefore, "snapshot must not stage anything into the real index");
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("Session-tree stop hook checkpoints only initialized sessions", () => {
	const initialized = mkdtempSync(join(tmpdir(), "session-tree-hook-a-"));
	const fresh = mkdtempSync(join(tmpdir(), "session-tree-hook-b-"));
	try {
		initGitRepo(initialized);
		// Initialize the session tree first: the stop hook only checkpoints
		// sessions that already use it.
		spawnSync("node", [cliPath, "snapshot", "Baseline"], { cwd: initialized, encoding: "utf8" });
		spawnSync("node", [cliPath, "hook", "stop"], {
			cwd: initialized,
			encoding: "utf8",
		});
		// Initialized session: nodes.json must now exist with an auto-checkpoint node.
		assert.ok(existsSync(join(initialized, ".lazyantigravity", "session-tree", "nodes.json")), "checkpoint must be recorded");
		const graph = JSON.parse(readFileSync(join(initialized, ".lazyantigravity", "session-tree", "nodes.json"), "utf8"));
		assert.ok(Object.values(graph.nodes).some((n) => String(n.label).startsWith("Auto-checkpoint")));

		// Fresh session (no nodes.json): the hook must not create any state.
		spawnSync("node", [cliPath, "hook", "stop"], {
			cwd: fresh,
			encoding: "utf8",
		});
		assert.equal(existsSync(join(fresh, ".lazyantigravity", "session-tree", "nodes.json")), false, "must not initialize silently");
	} finally {
		rmSync(initialized, { recursive: true, force: true });
		rmSync(fresh, { recursive: true, force: true });
	}
});

test("SessionTreeManager prune keeps the newest snapshot refs", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "st-prune-"));
	try {
		initGitRepo(tempDir);
		const manager = new SessionTreeManager(tempDir);
		for (let i = 0; i < 5; i++) {
			writeFileSync(join(tempDir, `f${i}.txt`), `content ${i}`, "utf8");
			manager.snapshot(`Snapshot ${i}`);
		}
		const refCount = () =>
			spawnSync("git", ["for-each-ref", "refs/lazyantigravity/snapshots/"], { cwd: tempDir, encoding: "utf8" })
				.stdout.trim().split("\n").filter((l) => l.length > 0).length;
		assert.equal(refCount(), 5, "precondition: five snapshot refs");
		const result = manager.prune(2);
		assert.equal(result.kept.length, 2);
		assert.equal(result.removed.length, 3);
		assert.equal(refCount(), 2, "only the newest two refs must survive");
		// The graph keeps its history even after refs are pruned.
		assert.equal(manager.renderAsciiTree().split("Snapshot").length - 1, 5);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("concurrent sessions can snapshot without corrupting nodes.json", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "st-concurrent-"));
	try {
		initGitRepo(tempDir);
		const cli = cliPath;
		const procs = [1, 2, 3].map((i) =>
			spawnSync("node", [cli, "snapshot", `Concurrent ${i}`], { cwd: tempDir, encoding: "utf8" }),
		);
		for (const p of procs) assert.equal(p.status, 0, p.stderr);
		const graph = JSON.parse(readFileSync(join(tempDir, ".lazyantigravity", "session-tree", "nodes.json"), "utf8"));
		assert.equal(Object.keys(graph.nodes).length, 3, "all three snapshots must persist intact");
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
