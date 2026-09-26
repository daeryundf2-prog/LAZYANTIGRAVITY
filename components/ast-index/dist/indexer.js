import { readFileSync, statSync } from "node:fs";
import { extractEntities } from "./language-extractors.js";
export function indexSourceFile(filePath) {
    const content = readFileSync(filePath, "utf8");
    const mtimeMs = statSync(filePath).mtimeMs;
    const { symbols, imports, calls } = extractEntities(filePath, content);
    return {
        file: filePath,
        mtimeMs,
        symbols,
        imports,
        calls,
    };
}
