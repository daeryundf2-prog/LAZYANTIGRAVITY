const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(?:pass(?:word|wd)?|pwd|token|secret|authorization|cookie|credential|api[_-]?key|private[_-]?key|access[_-]?key)/i;
const URL_USER_INFO = /([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi;
const AUTH_VALUE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_QUERY_SECRET = /([?&](?:pass(?:word|wd)?|pwd|token|secret|authorization|cookie|credential|api[_-]?key|private[_-]?key|access[_-]?key)=)[^&#\s]*/gi;

function truncateUtf8(value, maxBytes) {
	if (Buffer.byteLength(value) <= maxBytes) return value;
	const suffix = "...";
	let end = Math.max(0, maxBytes - Buffer.byteLength(suffix));
	while (end > 0 && Buffer.byteLength(`${value.slice(0, end)}${suffix}`) > maxBytes) end -= 1;
	return `${value.slice(0, end)}${suffix}`;
}

export function redactText(value, maxBytes = 2048) {
	const redacted = String(value)
		.replace(URL_USER_INFO, `$1${REDACTED}:${REDACTED}@`)
		.replace(AUTH_VALUE, `$1 ${REDACTED}`)
		.replace(URL_QUERY_SECRET, `$1${REDACTED}`);
	return truncateUtf8(redacted, maxBytes);
}

export function isSensitiveKey(value) {
	return SENSITIVE_KEY.test(String(value));
}

export function redactValue(value, state = { depth: 0, seen: new WeakSet() }) {
	if (typeof value === "string") return redactText(value, 1024 * 1024);
	if (value === null || typeof value !== "object") return value;
	if (state.depth >= 32 || state.seen.has(value)) return REDACTED;

	state.seen.add(value);
	const nextState = { depth: state.depth + 1, seen: state.seen };
	if (Array.isArray(value)) return value.map((item) => redactValue(item, nextState));

	const output = {};
	for (const [key, item] of Object.entries(value)) {
		output[key] = isSensitiveKey(key) ? REDACTED : redactValue(item, nextState);
	}
	return output;
}

export function publicDiagnostic(code, status = "failed") {
	return redactText(JSON.stringify({ code, status }), 2048);
}
