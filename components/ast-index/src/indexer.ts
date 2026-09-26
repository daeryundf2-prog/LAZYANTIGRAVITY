import { readFileSync, statSync } from "node:fs";
import { extractEntities } from "./language-extractors.js";
import { FileASTIndex } from "./types.js";

export function indexSourceFile(filePath: string): FileASTIndex {
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
