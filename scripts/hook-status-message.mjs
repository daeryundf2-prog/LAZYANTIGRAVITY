const PRODUCT_NAME = "LazyAntigravity";

const WORD_OVERRIDES = new Map([
	["lsp", "LSP"],
	["ulw-loop", "Ulw-Loop"],
]);

export function formatLazyAntigravityHookStatusMessage(version, label) {
	return `${PRODUCT_NAME}(${normalizeVersion(version)}): ${normalizeLazyAntigravityHookStatusLabel(label)}`;
}

export function normalizeLazyAntigravityHookStatusLabel(label) {
	const parsed = parseLazyAntigravityHookStatusMessage(label);
	const rawLabel = parsed === null ? label : parsed.label;
	const normalized = rawLabel.replace(/\bOMO\b/gi, " ").replace(/\s+/g, " ").trim();
	if (normalized.length === 0) return "";
	return normalized
		.split(" ")
		.map(formatWord)
		.join(" ");
}

export function parseLazyAntigravityHookStatusMessage(message) {
	const match = /^(?:LazyCodex|LazyAntigravity)\(([^)]+)\):\s+(.+)$/.exec(message.trim());
	if (match === null) return null;
	const [, version, label] = match;
	return { version, label };
}

// Legacy compatibility exports: keep existing callers working while generated
// hook status messages use the runtime product identity above.
export function formatLazyCodexHookStatusMessage(version, label) {
	return formatLazyAntigravityHookStatusMessage(version, label);
}
export const normalizeLazyCodexHookStatusLabel = normalizeLazyAntigravityHookStatusLabel;
export const parseLazyCodexHookStatusMessage = parseLazyAntigravityHookStatusMessage;

function normalizeVersion(version) {
	const normalized = version.trim();
	return normalized.length === 0 ? "local" : normalized;
}

function formatWord(word) {
	const lower = word.toLowerCase();
	const override = WORD_OVERRIDES.get(lower);
	if (override !== undefined) return override;
	if (word.includes("-")) {
		return word
			.split("-")
			.map(formatWord)
			.join("-");
	}
	return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}
