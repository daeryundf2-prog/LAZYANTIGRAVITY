export interface TreeNode {
	id: string;
	parentId: string | null;
	label: string;
	timestamp: number;
	gitSha: string;
	metadata?: Record<string, unknown>;
}

export interface SessionTreeGraph {
	activeNodeId: string | null;
	nodes: Record<string, TreeNode>;
}
