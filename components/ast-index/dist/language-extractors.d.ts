import { ASTSymbol, CallEdge } from "./types.js";
export interface ExtractedFileEntities {
    symbols: ASTSymbol[];
    imports: string[];
    calls: CallEdge[];
}
export type SupportedLanguage = "typescript" | "python" | "rust" | "go" | "generic";
export declare function detectLanguage(filePath: string): SupportedLanguage;
export declare function extractEntities(filePath: string, content: string): ExtractedFileEntities;
