import { ASTSymbol, CallEdge, ProjectASTGraph } from "./types.js";
export declare function findSymbols(graph: ProjectASTGraph, symbolName: string): ASTSymbol[];
export declare function findCallers(graph: ProjectASTGraph, calleeName: string): CallEdge[];
export declare function computeBlastRadius(graph: ProjectASTGraph, targetFilePath: string): {
    affectedFiles: string[];
    totalCallers: number;
};
