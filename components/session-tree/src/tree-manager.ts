import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionTreeGraph, TreeNode } from "./types.js";
import { createShadowSnapshot, restoreShadowSnapshot, runGit } from "./snapshot.js";

export function getTreeStoragePath(cwd: string = process.cwd()): string {
	const treeDir = join(cwd, ".lazyantigravity", "session-tree");
	if (!existsSync(treeDir)) {
		mkdirSync(treeDir, { recursive: true });
	}
	return join(treeDir, "nodes.json");
}

// Two sessions sharing a workspace race on nodes.json at Stop-hook time; a
// plain writeFileSync can interleave and corrupt the graph. Exclusive-create
// lock + bounded wait (with stale-lock steal) mirrors the memory component's
// file-lock discipline.
function withFileLock<T>(lockPath: string, fn: () => T): T {
	const startedAt = Date.now();
	let fd: number | null = null;
	for (;;) {
		try {
			fd = openSync(lockPath, "wx");
			break;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") throw error;
			if (Date.now() - startedAt > 5000) {
				try {
					unlinkSync(lockPath); // stale lock: steal it
				} catch {}
				continue;
			}
			const sleeper = new SharedArrayBuffer(4);
			Atomics.wait(new Int32Array(sleeper), 0, 0, 25);
		}
	}
	try {
		return fn();
	} finally {
		if (fd !== null) closeSync(fd);
		try {
			unlinkSync(lockPath);
		} catch {}
	}
}

export class SessionTreeManager {
	private graph: SessionTreeGraph;
	private cwd: string;

	constructor(cwd: string = process.cwd()) {
		this.cwd = cwd;
		this.graph = this.load();
	}

	private load(): SessionTreeGraph {
		const p = getTreeStoragePath(this.cwd);
		if (!existsSync(p)) {
			return { activeNodeId: null, nodes: {} };
		}
		try {
			return JSON.parse(readFileSync(p, "utf8"));
		} catch {
			return { activeNodeId: null, nodes: {} };
		}
	}

	private save(): void {
		const p = getTreeStoragePath(this.cwd);
		withFileLock(`${p}.lock`, () => {
			writeFileSync(p, JSON.stringify(this.graph, null, 2), "utf8");
		});
	}

	public snapshot(label: string, metadata?: Record<string, unknown>): TreeNode {
		const gitSha = createShadowSnapshot(label, this.cwd);
		const id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

		const node: TreeNode = {
			id,
			parentId: this.graph.activeNodeId,
			label,
			timestamp: Date.now(),
			gitSha,
			metadata,
		};

		this.graph.nodes[id] = node;
		this.graph.activeNodeId = id;
		this.save();
		return node;
	}

	public fork(nodeId: string): TreeNode {
		const targetNode = this.graph.nodes[nodeId];
		if (!targetNode) {
			throw new Error(`Node with id "${nodeId}" not found in session tree.`);
		}

		// Revert filesystem to snapshot
		restoreShadowSnapshot(targetNode.gitSha, this.cwd);

		// Set active node to target
		this.graph.activeNodeId = nodeId;
		this.save();
		return targetNode;
	}

	public prune(keep: number): { removed: string[]; kept: string[] } {
		// Snapshot refs accumulate on every Stop-hook checkpoint; keep only the
		// newest `keep` shadow refs (the graph in nodes.json keeps its history).
		const out = runGit(
			["for-each-ref", "--sort=-committerdate", "--format=%(refname)", "refs/lazyantigravity/snapshots/"],
			this.cwd,
			false,
		);
		const refs = out.split("\n").map((r) => r.trim()).filter((r) => r.length > 0);
		const removed: string[] = [];
		const kept: string[] = [];
		refs.forEach((ref, index) => {
			if (index < keep) {
				kept.push(ref);
				return;
			}
			runGit(["update-ref", "-d", ref], this.cwd, false);
			removed.push(ref);
		});
		return { removed, kept };
	}

	public getActiveNode(): TreeNode | null {
		return this.graph.activeNodeId ? this.graph.nodes[this.graph.activeNodeId] || null : null;
	}

	public renderAsciiTree(): string {
		const lines: string[] = ["=== Session Hypothesis Tree ==="];
		const rootNodes = Object.values(this.graph.nodes).filter((n) => n.parentId === null);

		const renderBranch = (node: TreeNode, indent = "") => {
			const isActive = node.id === this.graph.activeNodeId ? " 🟢 (ACTIVE)" : "";
			const dateStr = new Date(node.timestamp).toLocaleTimeString();
			lines.push(`${indent}├── [${node.id}] ${node.label} (${node.gitSha.slice(0, 7)}) @ ${dateStr}${isActive}`);

			const children = Object.values(this.graph.nodes).filter((n) => n.parentId === node.id);
			for (const child of children) {
				renderBranch(child, indent + "│   ");
			}
		};

		for (const root of rootNodes) {
			renderBranch(root);
		}

		if (rootNodes.length === 0) {
			lines.push("  (No snapshots recorded yet)");
		}

		return lines.join("\n");
	}
}
