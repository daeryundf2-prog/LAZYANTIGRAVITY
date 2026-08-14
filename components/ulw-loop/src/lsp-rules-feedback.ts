import { existsSync } from "node:fs";
import { join } from "node:path";

function resolveBundledModule(repoRoot: string, relativeCandidates: string[]): string | null {
	for (const relative of relativeCandidates) {
		const absolute = join(repoRoot, relative);
		if (existsSync(absolute)) return absolute;
	}
	return null;
}

export async function collectLspDiagnostics(repoRoot: string, filesChanged: string[]): Promise<string[]> {
	try {
		const lspPath = resolveBundledModule(repoRoot, [
			"components/lsp/dist/codex-hook.js",
			"plugins/omo/components/lsp/dist/codex-hook.js",
		]);
		if (!lspPath) return [];
		const { runLspDiagnosticsText } = await import(new URL(`file://${lspPath}`).href);

		const results: string[] = [];
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
	} catch {
		return [];
	}
}

export async function collectRulesViolations(repoRoot: string, filesChanged: string[]): Promise<string[]> {
	try {
		const rulesPath = resolveBundledModule(repoRoot, [
			"components/rules/dist/rules-engine-factory.js",
			"plugins/omo/components/rules/dist/rules-engine-factory.js",
		]);
		if (!rulesPath) return [];
		const { createRulesEngine } = await import(new URL(`file://${rulesPath}`).href);

		const engine = createRulesEngine({ platform: process.platform });
		const loaded = engine.loadDynamicRules(repoRoot, filesChanged);

		const results: string[] = [];
		if (loaded.diagnostics && loaded.diagnostics.length > 0) {
			for (const diag of loaded.diagnostics) {
				results.push(`Rule warning in ${diag.filePath}: ${diag.message}`);
			}
		}
		return results;
	} catch {
		return [];
	}
}

export function injectFeedbackContext(prompt: string, lspDiagnostics: string[], rulesViolations: string[]): string {
	let enriched = prompt;
	if (lspDiagnostics.length > 0) {
		enriched += `\n\n[LSP Diagnostics Context]\n${lspDiagnostics.join("\n")}`;
	}
	if (rulesViolations.length > 0) {
		enriched += `\n\n[Rules Evaluation Context]\n${rulesViolations.join("\n")}`;
	}
	return enriched;
}

export function generateReworkSuggestions(lspDiagnostics: string[], rulesViolations: string[]): string {
	const suggestions: string[] = ["Rework is required to fix errors:"];
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
			} else if (parsed.errorCode === "TS2339") {
				suggestions.push(`  TS2339 (Property does not exist): Check the type definition; the property may have been renamed or removed.`);
			} else if (parsed.errorCode === "TS2322") {
				suggestions.push(`  TS2322 (Type mismatch): The assigned value's type does not match the target. Adjust the type or cast safely.`);
			} else if (parsed.errorCode === "TS2551") {
				suggestions.push(`  TS2551 (Property does not exist, did you mean): A typo is likely. Use the suggested name.`);
			}
		} else {
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

interface ParsedLspDiagnostic {
	readonly file: string;
	readonly line: number | null;
	readonly message: string;
	readonly errorCode: string | null;
	readonly missingName: string | null;
}

function parseLspDiagnostic(raw: string): ParsedLspDiagnostic | null {
	const match = raw.match(/^LSP error in (.+?):\s*(.+)$/);
	if (!match) return null;
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
