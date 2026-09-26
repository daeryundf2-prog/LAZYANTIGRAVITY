export function findSymbols(graph, symbolName) {
    const results = [];
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
export function findCallers(graph, calleeName) {
    const callers = [];
    for (const fileIndex of Object.values(graph.files)) {
        for (const edge of fileIndex.calls) {
            if (edge.callee === calleeName) {
                callers.push(edge);
            }
        }
    }
    return callers;
}
export function computeBlastRadius(graph, targetFilePath) {
    const transitive = computeTransitiveBlastRadius(graph, targetFilePath, "file");
    return {
        affectedFiles: transitive.affectedFiles,
        totalCallers: transitive.totalCallSites,
    };
}
export function computeTransitiveBlastRadius(graph, target, targetType = "file") {
    const directCallers = [];
    const indirectCallers = [];
    const affectedFilesSet = new Set();
    const visitedFunctions = new Set();
    const queue = [];
    if (targetType === "file") {
        let targetIndex = graph.files[target];
        if (!targetIndex) {
            for (const [f, idx] of Object.entries(graph.files)) {
                if (f.endsWith(target) || target.endsWith(f)) {
                    targetIndex = idx;
                    break;
                }
            }
        }
        const exportedSymbols = targetIndex
            ? new Set(targetIndex.symbols.filter((s) => s.isExported).map((s) => s.name))
            : new Set();
        for (const [file, index] of Object.entries(graph.files)) {
            if (file === target || (targetIndex && file === targetIndex.file))
                continue;
            for (const edge of index.calls) {
                if (exportedSymbols.has(edge.callee)) {
                    directCallers.push(edge);
                    affectedFilesSet.add(file);
                    if (edge.caller !== "global" && !visitedFunctions.has(edge.caller)) {
                        visitedFunctions.add(edge.caller);
                        queue.push({ funcName: edge.caller, depth: 1 });
                    }
                }
            }
        }
    }
    else {
        for (const [file, index] of Object.entries(graph.files)) {
            for (const edge of index.calls) {
                if (edge.callee === target) {
                    directCallers.push(edge);
                    affectedFilesSet.add(file);
                    if (edge.caller !== "global" && !visitedFunctions.has(edge.caller)) {
                        visitedFunctions.add(edge.caller);
                        queue.push({ funcName: edge.caller, depth: 1 });
                    }
                }
            }
        }
    }
    while (queue.length > 0) {
        const item = queue.shift();
        if (!item)
            break;
        const { funcName, depth } = item;
        if (depth >= 5)
            continue;
        for (const [file, index] of Object.entries(graph.files)) {
            for (const edge of index.calls) {
                if (edge.callee === funcName) {
                    indirectCallers.push(edge);
                    affectedFilesSet.add(file);
                    if (edge.caller !== "global" && !visitedFunctions.has(edge.caller)) {
                        visitedFunctions.add(edge.caller);
                        queue.push({ funcName: edge.caller, depth: depth + 1 });
                    }
                }
            }
        }
    }
    const isTestFile = (pathStr) => {
        const norm = pathStr.toLowerCase().replace(/\\/g, "/");
        return (norm.includes("/test/") ||
            norm.includes("/tests/") ||
            norm.includes("/__tests__/") ||
            norm.endsWith(".test.ts") ||
            norm.endsWith(".test.js") ||
            norm.endsWith(".test.mjs") ||
            norm.endsWith("_test.go") ||
            norm.endsWith("_test.py") ||
            norm.endsWith("test.rs"));
    };
    const affectedFiles = Array.from(affectedFilesSet);
    const affectedTestFiles = affectedFiles.filter(isTestFile);
    const totalCallSites = directCallers.length + indirectCallers.length;
    return {
        target,
        targetType,
        directCallers,
        indirectCallers,
        affectedFiles,
        affectedTestFiles,
        totalCallSites,
    };
}
