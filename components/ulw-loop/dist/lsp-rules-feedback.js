import { existsSync } from "node:fs";
import { join } from "node:path";
export async function collectLspDiagnostics(repoRoot, filesChanged) {
    try {
        const lspPath = join(repoRoot, "plugins/omo/components/lsp/dist/codex-hook.js");
        if (!existsSync(lspPath))
            return [];
        const { runLspDiagnosticsText } = await import(new URL(`file://${lspPath}`).href);
        const results = [];
        for (const file of filesChanged) {
            const filePath = join(repoRoot, file);
            if (existsSync(filePath)) {
                const diag = await runLspDiagnosticsText(filePath);
                if (diag && diag.trim() !== "" && !diag.includes("No diagnostics found")) {
                    results.push(`LSP error in ${file}: ${diag.trim()}`);
                }
            }
        }
        return results;
    }
    catch {
        return [];
    }
}
export async function collectRulesViolations(repoRoot, filesChanged) {
    try {
        const rulesPath = join(repoRoot, "plugins/omo/components/rules/dist/rules-engine-factory.js");
        if (!existsSync(rulesPath))
            return [];
        const { createRulesEngine } = await import(new URL(`file://${rulesPath}`).href);
        const engine = createRulesEngine({ platform: process.platform });
        const loaded = engine.loadDynamicRules(repoRoot, filesChanged);
        const results = [];
        if (loaded.diagnostics && loaded.diagnostics.length > 0) {
            for (const diag of loaded.diagnostics) {
                results.push(`Rule warning in ${diag.filePath}: ${diag.message}`);
            }
        }
        return results;
    }
    catch {
        return [];
    }
}
export function injectFeedbackContext(prompt, lspDiagnostics, rulesViolations) {
    let enriched = prompt;
    if (lspDiagnostics.length > 0) {
        enriched += `\n\n[LSP Diagnostics Context]\n${lspDiagnostics.join("\n")}`;
    }
    if (rulesViolations.length > 0) {
        enriched += `\n\n[Rules Evaluation Context]\n${rulesViolations.join("\n")}`;
    }
    return enriched;
}
export function generateReworkSuggestions(lspDiagnostics, rulesViolations) {
    const suggestions = ["Rework is required to fix errors:"];
    for (const diag of lspDiagnostics) {
        const parsed = parseLspDiagnostic(diag);
        if (parsed) {
            suggestions.push(`- LSP error in ${parsed.file}:${parsed.line ?? "?"}: ${parsed.message}`);
            if (parsed.errorCode || parsed.missingName) {
                suggestions.push(`  Suggested ast-grep search pattern: $$PROP$$ where the error occurs, then apply the correct type or import.`);
            }
            if (parsed.missingName) {
                suggestions.push(`  Missing name: '${parsed.missingName}'. Check if an import is missing or a variable was renamed.`);
            }
            if (parsed.errorCode === "TS2304") {
                suggestions.push(`  TS2304 (Cannot find name): Add the missing import or define the variable before its first use.`);
            }
            else if (parsed.errorCode === "TS2339") {
                suggestions.push(`  TS2339 (Property does not exist): Check the type definition; the property may have been renamed or removed.`);
            }
            else if (parsed.errorCode === "TS2322") {
                suggestions.push(`  TS2322 (Type mismatch): The assigned value's type does not match the target. Adjust the type or cast safely.`);
            }
            else if (parsed.errorCode === "TS2551") {
                suggestions.push(`  TS2551 (Property does not exist, did you mean): A typo is likely. Use the suggested name.`);
            }
        }
        else {
            suggestions.push(`- LSP error found: ${diag}`);
        }
    }
    for (const rule of rulesViolations) {
        suggestions.push(`- Rule violation: ${rule}. Align code with workspace AST patterns using ast_grep_search to find similar structures.`);
    }
    if (lspDiagnostics.length >= 3) {
        suggestions.push(`- WARNING: ${lspDiagnostics.length} LSP errors detected. Consider switching to Gemini 3.7 Flash (Medium) for rapid iterative bug fixes before re-attempting the checkpoint.`);
    }
    return suggestions.join("\n");
}
function parseLspDiagnostic(raw) {
    const match = raw.match(/^LSP error in (.+?):\s*(.+)$/);
    if (!match)
        return null;
    const file = match[1] ?? "";
    const rest = match[2] ?? "";
    const lineMatch = rest.match(/:?(?:(\d+):\d+)/);
    const line = lineMatch ? Number.parseInt(lineMatch[1] ?? "0", 10) : null;
    const codeMatch = rest.match(/(?:error\s+)?(TS\d{4})/i);
    const errorCode = codeMatch ? (codeMatch[1] ?? "").toUpperCase() : null;
    const nameMatch = rest.match(/Cannot find name ['"]([^'"]+)['"]/i) ?? rest.match(/did you mean ['"]([^'"]+)['"]?/i);
    const missingName = nameMatch ? (nameMatch[1] ?? null) : null;
    const cleanedMessage = rest.replace(/^:?\s*/, "").trim();
    return { file, line, message: cleanedMessage, errorCode, missingName };
}
