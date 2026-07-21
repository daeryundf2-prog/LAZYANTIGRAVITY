export const MAX_HOOK_DIAGNOSTIC_BYTES = 2_048;

const DIAGNOSTIC_MESSAGES = Object.freeze({
	ANTIGRAVITY_HOOK_EVENT_UNSUPPORTED: "Only PreInvocation and Stop are supported.",
	ANTIGRAVITY_HOOK_INPUT_EMPTY: "Hook input must contain one JSON object.",
	ANTIGRAVITY_HOOK_JSON_INVALID: "Hook input is not valid JSON.",
	ANTIGRAVITY_HOOK_INPUT_ROOT_INVALID: "Hook input root must be an object.",
	ANTIGRAVITY_HOOK_INPUT_FIELD_UNSUPPORTED: "Hook input contains an unsupported field.",
	ANTIGRAVITY_HOOK_INPUT_FIELD_MISSING: "Hook input is missing a required field.",
	ANTIGRAVITY_HOOK_INPUT_FIELD_TYPE_INVALID: "Hook input contains an invalid documented field value.",
	ANTIGRAVITY_CONTEXT_PATH_UNSAFE: "OMO context source resolved outside the declared workspace.",
	ANTIGRAVITY_CONTEXT_GOALS_INVALID: "OMO goals.json is not schema-valid JSON.",
	ANTIGRAVITY_CONTEXT_SOURCE_UNREADABLE: "OMO context source could not be read.",
});

export function formatAntigravityHookDiagnostic(error) {
	const code = Object.hasOwn(DIAGNOSTIC_MESSAGES, error?.code)
		? error.code
		: "ANTIGRAVITY_HOOK_INPUT_INVALID";
	const message = DIAGNOSTIC_MESSAGES[code] ?? "Hook input is invalid.";
	const diagnostic = `${code}: ${message}\n`;
	if (Buffer.byteLength(diagnostic, "utf8") > MAX_HOOK_DIAGNOSTIC_BYTES) {
		return "ANTIGRAVITY_HOOK_INPUT_INVALID: Hook input is invalid.\n";
	}
	return diagnostic;
}
