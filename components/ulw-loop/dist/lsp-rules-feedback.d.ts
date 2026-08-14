export declare function collectLspDiagnostics(repoRoot: string, filesChanged: string[]): Promise<string[]>;
export declare function collectRulesViolations(repoRoot: string, filesChanged: string[]): Promise<string[]>;
export declare function injectFeedbackContext(prompt: string, lspDiagnostics: string[], rulesViolations: string[]): string;
export declare function generateReworkSuggestions(lspDiagnostics: string[], rulesViolations: string[]): string;
