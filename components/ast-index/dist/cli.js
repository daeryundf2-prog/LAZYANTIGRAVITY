#!/usr/bin/env node
import { resolve } from "node:path";
import { buildIncrementalASTGraph, loadASTGraph } from "./cache.js";
import { computeBlastRadius, findCallers, findSymbols } from "./query.js";
const args = process.argv.slice(2);
const command = args[0];
function main() {
    const cwd = process.cwd();
    if (command === "preindex") {
        const targetDir = args[1] ? resolve(args[1]) : cwd;
        const start = Date.now();
        const graph = buildIncrementalASTGraph(targetDir);
        const duration = Date.now() - start;
        const fileCount = Object.keys(graph.files).length;
        console.log(`[AST-Index] Indexed ${fileCount} files in ${duration}ms. Saved to .lazyantigravity/cache/ast-graph.json`);
    }
    else if (command === "symbol") {
        const name = args[1];
        if (!name) {
            console.error("Usage: ast-index symbol <name>");
            process.exit(1);
        }
        const graph = loadASTGraph(cwd) || buildIncrementalASTGraph(cwd);
        const results = findSymbols(graph, name);
        console.log(`=== Found ${results.length} symbol(s) matching "${name}" ===`);
        for (const s of results) {
            console.log(`- [${s.kind}] ${s.name} in ${s.file}:${s.line} (Exported: ${s.isExported})`);
        }
    }
    else if (command === "callers") {
        const callee = args[1];
        if (!callee) {
            console.error("Usage: ast-index callers <calleeFunction>");
            process.exit(1);
        }
        const graph = loadASTGraph(cwd) || buildIncrementalASTGraph(cwd);
        const callers = findCallers(graph, callee);
        console.log(`=== Callers of "${callee}" (${callers.length}) ===`);
        for (const c of callers) {
            console.log(`- ${c.caller}() in ${c.file}:${c.line}`);
        }
    }
    else if (command === "blast-radius") {
        const file = args[1] ? resolve(args[1]) : "";
        if (!file) {
            console.error("Usage: ast-index blast-radius <file>");
            process.exit(1);
        }
        const graph = loadASTGraph(cwd) || buildIncrementalASTGraph(cwd);
        const blast = computeBlastRadius(graph, file);
        console.log(`=== Blast Radius Analysis for: ${file} ===`);
        console.log(`- Impacted Files Count: ${blast.affectedFiles.length}`);
        console.log(`- Total External Call Sites: ${blast.totalCallers}`);
        for (const f of blast.affectedFiles) {
            console.log(`  * ${f}`);
        }
    }
    else if (command === "hook" && args[1] === "session-start") {
        // Non-blocking preindex trigger on session start
        try {
            buildIncrementalASTGraph(cwd);
        }
        catch { }
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: "",
            },
        }));
    }
    else {
        console.log("LazyAntigravity AST Indexer CLI");
        console.log("Commands: preindex [dir] | symbol <name> | callers <fn> | blast-radius <file> | hook session-start");
    }
}
main();
