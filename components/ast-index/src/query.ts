import { ASTSymbol, CallEdge, ProjectASTGraph } from "./types.js";

export function findSymbols(graph: ProjectASTGraph, symbolName: string): ASTSymbol[] {
	const results: ASTSymbol[] = [];
	const lower = symbolName.toLowerCase();

	for (const fileIndex of Object.values(graph.files)) {
		for (const sym of fileIndex.symbols) {
			if (sym.name.toLowerCase() === lower || sym.name.includes(symbolName)) {
				results.push(sym);
			}
		}
	}
	return results;
}

export function findCallers(graph: ProjectASTGraph, calleeName: string): CallEdge[] {
	const callers: CallEdge[] = [];
	for (const fileIndex of Object.values(graph.files)) {
		for (const edge of fileIndex.calls) {
			if (edge.callee === calleeName) {
				callers.push(edge);
			}
		}
	}
	return callers;
}

export function computeBlastRadius(graph: ProjectASTGraph, targetFilePath: string): { affectedFiles: string[]; totalCallers: number } {
	const targetIndex = graph.files[targetFilePath];
	if (!targetIndex) {
		return { affectedFiles: [], totalCallers: 0 };
	}

	const exportedSymbols = new Set(targetIndex.symbols.filter((s) => s.isExported).map((s) => s.name));
	const affectedFilesSet = new Set<string>();
	let totalCallers = 0;

	for (const [file, index] of Object.entries(graph.files)) {
		if (file === targetFilePath) continue;

		for (const edge of index.calls) {
			if (exportedSymbols.has(edge.callee)) {
				affectedFilesSet.add(file);
				totalCallers++;
			}
		}
	}

	return {
		affectedFiles: Array.from(affectedFilesSet),
		totalCallers,
	};
}
