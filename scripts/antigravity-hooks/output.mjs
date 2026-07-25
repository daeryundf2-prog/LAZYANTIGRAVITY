export function formatEmptyPreInvocationResponse() {
	return "{}\n";
}

export function formatEphemeralMessageResponse(ephemeralMessage) {
	assertNonEmptyString(ephemeralMessage, "ephemeralMessage");
	return `${JSON.stringify({ injectSteps: [{ ephemeralMessage }] })}\n`;
}

export function formatContinueResponse(reason) {
	assertNonEmptyString(reason, "reason");
	return `${JSON.stringify({ decision: "continue", reason })}\n`;
}

export function formatStopResponse() {
	return '{"decision":"stop"}\n';
}

export function formatPreToolUseAllowResponse() {
	return '{"decision":"allow"}\n';
}

export function formatPreToolUseDenyResponse(reason) {
	assertNonEmptyString(reason, "reason");
	return `${JSON.stringify({ decision: "deny", reason })}\n`;
}

export function formatPreToolUseAskResponse(reason) {
	assertNonEmptyString(reason, "reason");
	return `${JSON.stringify({ decision: "ask", reason })}\n`;
}

export function formatPostToolUseResponse(warning) {
	if (typeof warning !== "string" || warning.length === 0) return "{}\n";
	return `${JSON.stringify({})}\n`;
}

function assertNonEmptyString(value, name) {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${name} must be a non-empty string`);
	}
}
