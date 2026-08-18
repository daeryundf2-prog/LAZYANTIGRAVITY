import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { SessionTreeManager } from "../dist/tree-manager.js";

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

		// Make changes and snapshot 2
		writeFileSync(join(tempDir, "feature.ts"), "export const a = 1;", "utf8");
		spawnSync("git", ["add", "."], { cwd: tempDir });
		const node2 = manager.snapshot("Added feature A");
		assert.equal(node2.parentId, node1.id);

		// Fork back to baseline and create alternative branch
		const forked = manager.fork(node1.id);
		assert.equal(forked.id, node1.id);

		writeFileSync(join(tempDir, "feature_alt.ts"), "export const b = 2;", "utf8");
		spawnSync("git", ["add", "."], { cwd: tempDir });
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
