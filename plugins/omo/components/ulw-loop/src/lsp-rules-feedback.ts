import { existsSync } from "node:fs";
import { join } from "node:path";

export async function collectLspDiagnostics(repoRoot: string, filesChanged: string[]): Promise<string[]> {
	try {
		const lspPath = join(repoRoot, "plugins/omo/components/lsp/dist/codex-hook.js");
		if (!existsSync(lspPath)) return [];
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
		const rulesPath = join(repoRoot, "plugins/omo/components/rules/dist/rules-engine-factory.js");
		if (!existsSync(rulesPath)) return [];
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
	for (const _diag of lspDiagnostics) {
		suggestions.push(`- LSP error found: Resolve build compiler error reported in diagnostics.`);
	}
	for (const _rule of rulesViolations) {
		suggestions.push(`- Rule violation found: Align code with workspace AST patterns.`);
	}
	return suggestions.join("\n");
}
