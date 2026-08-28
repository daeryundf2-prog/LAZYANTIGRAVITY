// Maps the lsp-tools-mcp JSON envelope onto the hook contract's plain-text markers.
const CLEAN_DIAGNOSTICS_TEXT = "No diagnostics found";
// The MCP tool returns a JSON envelope; the hook contract expects plain text
// markers ("No diagnostics found", the unsupported-extension sentence, or bare
// diagnostic lines). Mapping here is what keeps clean edits silent.
export function formatDiagnosticsText(text) {
    try {
        const parsed = JSON.parse(text);
        if (parsed.toolAvailable === false) {
            return parsed.toolNote ?? "LSP diagnostics unavailable";
        }
        const diagnostics = Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [];
        if (diagnostics.length === 0) {
            return CLEAN_DIAGNOSTICS_TEXT;
        }
        return diagnostics
            .map((diagnostic) => diagnostic.message ?? "")
            .filter((message) => message.length > 0)
            .join("\n");
    }
    catch {
        return text; // non-JSON output: pass through unchanged
    }
}
