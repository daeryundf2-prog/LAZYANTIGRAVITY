export declare const LSP_TOOLS: readonly unknown[];
export declare function executeLspDiagnostics(params: { filePath: string; severity?: string }): Promise<{
	content: Array<{ text: string }>;
}>;
