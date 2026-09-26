import { ASTSymbol, CallEdge, ProjectASTGraph, TransitiveImpactResult } from "./types.js";
export declare function findSymbols(graph: ProjectASTGraph, symbolName: string): ASTSymbol[];
export declare function findCallers(graph: ProjectASTGraph, calleeName: string): CallEdge[];
export declare function computeBlastRadius(graph: ProjectASTGraph, targetFilePath: string): {
    affectedFiles: string[];
    totalCallers: number;
};
export declare function computeTransitiveBlastRadius(graph: ProjectASTGraph, target: string, targetType?: "file" | "symbol"): TransitiveImpactResult;
