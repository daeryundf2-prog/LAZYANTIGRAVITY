import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionTreeGraph, TreeNode } from "./types.js";
import { createShadowSnapshot, restoreShadowSnapshot } from "./snapshot.js";

export function getTreeStoragePath(cwd: string = process.cwd()): string {
	const treeDir = join(cwd, ".lazyantigravity", "session-tree");
	if (!existsSync(treeDir)) {
		mkdirSync(treeDir, { recursive: true });
	}
	return join(treeDir, "nodes.json");
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
		writeFileSync(p, JSON.stringify(this.graph, null, 2), "utf8");
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
