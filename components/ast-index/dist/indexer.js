import { readFileSync, statSync } from "node:fs";
export function indexSourceFile(filePath) {
    const content = readFileSync(filePath, "utf8");
    const mtimeMs = statSync(filePath).mtimeMs;
    const symbols = [];
    const imports = [];
    const calls = [];
    const lines = content.split("\n");
    let currentFunctionScope = "global";
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const trimmed = line.trim();
        // 1. Imports
        const importMatch = trimmed.match(/import\s+.*?from\s+["'](.*?)["']/);
        if (importMatch) {
            imports.push(importMatch[1]);
        }
        // 2. Export status
        const isExported = /^(export\s+)/.test(trimmed);
        // 3. Functions
        const fnMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\((.*?)\)/);
        if (fnMatch) {
            const name = fnMatch[1];
            currentFunctionScope = name;
            symbols.push({
                name,
                kind: "function",
                file: filePath,
                line: lineNum,
                isExported,
                signature: `${name}(${fnMatch[2]})`,
            });
            continue;
        }
        // 4. Classes
        const classMatch = trimmed.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
        if (classMatch) {
            const name = classMatch[1];
            symbols.push({
                name,
                kind: "class",
                file: filePath,
                line: lineNum,
                isExported,
            });
            continue;
        }
        // 5. Interfaces
        const ifaceMatch = trimmed.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
        if (ifaceMatch) {
            const name = ifaceMatch[1];
            symbols.push({
                name,
                kind: "interface",
                file: filePath,
                line: lineNum,
                isExported,
            });
            continue;
        }
        // 6. Types
        const typeMatch = trimmed.match(/(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
        if (typeMatch) {
            const name = typeMatch[1];
            symbols.push({
                name,
                kind: "type",
                file: filePath,
                line: lineNum,
                isExported,
            });
            continue;
        }
        // 7. Arrow functions / Constants
        const constFnMatch = trimmed.match(/(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\((.*?)\)\s*=>/);
        if (constFnMatch) {
            const name = constFnMatch[1];
            currentFunctionScope = name;
            symbols.push({
                name,
                kind: "function",
                file: filePath,
                line: lineNum,
                isExported,
                signature: `${name}(${constFnMatch[2]})`,
            });
            continue;
        }
        // 8. Function Calls inside functions
        const callMatches = trimmed.matchAll(/\b([a-zA-Z0-9_$]+)\s*\(/g);
        for (const callMatch of callMatches) {
            const callee = callMatch[1];
            if (!["if", "for", "while", "switch", "catch", "function", "return"].includes(callee)) {
                calls.push({
                    caller: currentFunctionScope,
                    callee,
                    file: filePath,
                    line: lineNum,
                });
            }
        }
    }
    return {
        file: filePath,
        mtimeMs,
        symbols,
        imports,
        calls,
    };
}
