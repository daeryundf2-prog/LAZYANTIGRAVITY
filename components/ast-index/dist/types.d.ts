export type SymbolKind = "function" | "class" | "interface" | "type" | "variable" | "method";
export interface ASTSymbol {
    name: string;
    kind: SymbolKind;
    file: string;
    line: number;
    isExported: boolean;
    signature?: string;
}
export interface CallEdge {
    caller: string;
    callee: string;
    file: string;
    line: number;
}
export interface FileASTIndex {
    file: string;
    mtimeMs: number;
    symbols: ASTSymbol[];
    imports: string[];
    calls: CallEdge[];
}
export interface ProjectASTGraph {
    version: string;
    generatedAt: number;
    files: Record<string, FileASTIndex>;
}
