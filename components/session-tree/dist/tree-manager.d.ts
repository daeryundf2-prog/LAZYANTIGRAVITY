import { TreeNode } from "./types.js";
export declare function getTreeStoragePath(cwd?: string): string;
export declare class SessionTreeManager {
    private graph;
    private cwd;
    constructor(cwd?: string);
    private load;
    private save;
    snapshot(label: string, metadata?: Record<string, unknown>): TreeNode;
    fork(nodeId: string): TreeNode;
    prune(keep: number): {
        removed: string[];
        kept: string[];
    };
    getActiveNode(): TreeNode | null;
    renderAsciiTree(): string;
}
