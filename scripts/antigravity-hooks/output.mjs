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

function assertNonEmptyString(value, name) {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${name} must be a non-empty string`);
	}
}
