/**
 * Extracts structural declarations (interfaces, types, function signatures, class skeletons)
 * while replacing deep function/method implementations with minimal stubs.
 */
export function skeletonizeCode(source, filename = "file.ts") {
    const originalLength = source.length;
    if (originalLength === 0) {
        return { originalLength: 0, skeletonLength: 0, compressionRatio: 1.0, skeleton: "" };
    }
    const isPython = filename.endsWith(".py");
    let skeleton = "";
    if (isPython) {
        skeleton = skeletonizePython(source);
    }
    else {
        // TypeScript, JavaScript, Rust, Go
        skeleton = skeletonizeCStyle(source);
    }
    const skeletonLength = skeleton.length;
    const compressionRatio = originalLength > 0 ? Number((skeletonLength / originalLength).toFixed(2)) : 1.0;
    return {
        originalLength,
        skeletonLength,
        compressionRatio,
        skeleton,
    };
}
function skeletonizeCStyle(source) {
    const lines = source.split(/\r?\n/);
    const result = [];
    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Preserve comment blocks & docstrings
        if (trimmed.startsWith("/*"))
            inBlockComment = true;
        if (inBlockComment) {
            result.push(line);
            if (trimmed.endsWith("*/"))
                inBlockComment = false;
            continue;
        }
        if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
            result.push(line);
            continue;
        }
        // Preserve import / export / interface / type declarations
        if (/^(import|export\s+(type|interface|enum|const|let|var|default)|type\s+|interface\s+|enum\s+)/.test(trimmed)) {
            result.push(line);
            continue;
        }
        // Function declarations: replace body with /* ... */
        if (/^(export\s+)?(async\s+)?function(\s+[\w$]+|\s*\()/.test(trimmed) ||
            /^(export\s+)?(public|private|protected|static|async|\s)*[\w$]+\([^)]*\)(:\s*[\w<>\[\]|&\s]+)?\s*\{?$/.test(trimmed)) {
            if (trimmed.endsWith("{")) {
                result.push(line.replace(/\{$/, "/* ... */"));
            }
            else {
                result.push(line);
            }
            continue;
        }
        // Class headers
        if (/^(export\s+)?(abstract\s+)?class\s+[\w$]+/.test(trimmed)) {
            result.push(line);
            continue;
        }
        // Keep closing braces and blank lines
        if (trimmed === "}" || trimmed === "};" || trimmed === "") {
            result.push(line);
            continue;
        }
        // Inside body: if line ends with {, replace with /* ... */ and skip interior
        if (trimmed.endsWith("{")) {
            result.push(line.replace(/\{$/, "/* ... */"));
        }
    }
    return result.join("\n");
}
function skeletonizePython(source) {
    const lines = source.split(/\r?\n/);
    const result = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("import ") ||
            trimmed.startsWith("from ") ||
            trimmed.startsWith("class ") ||
            trimmed.startsWith("def ") ||
            trimmed.startsWith("@") ||
            trimmed.startsWith("#") ||
            trimmed === "") {
            result.push(line);
            if (trimmed.startsWith("def ") && trimmed.endsWith(":")) {
                const indent = line.match(/^\s*/)?.[0] || "";
                result.push(`${indent}    ...`);
            }
        }
    }
    return result.join("\n");
}
