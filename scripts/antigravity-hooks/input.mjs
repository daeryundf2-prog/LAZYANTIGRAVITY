const COMMON_FIELDS = Object.freeze([
	"conversationId",
	"workspacePaths",
	"transcriptPath",
	"artifactDirectoryPath",
]);

const EVENT_FIELDS = Object.freeze({
	PreInvocation: Object.freeze(["invocationNum", "initialNumSteps"]),
	Stop: Object.freeze(["executionNum", "terminationReason", "error", "fullyIdle"]),
});

const REQUIRED_EVENT_FIELDS = Object.freeze({
	PreInvocation: Object.freeze(["invocationNum", "initialNumSteps"]),
	Stop: Object.freeze(["executionNum", "terminationReason", "fullyIdle"]),
});

export const SUPPORTED_HOOK_EVENTS = Object.freeze(["PreInvocation", "Stop"]);

export function parseAntigravityHookInput(event, rawInput) {
	if (!SUPPORTED_HOOK_EVENTS.includes(event)) return failure("ANTIGRAVITY_HOOK_EVENT_UNSUPPORTED");
	if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
		return failure("ANTIGRAVITY_HOOK_INPUT_EMPTY");
	}

	let payload;
	try {
		payload = JSON.parse(rawInput);
	} catch {
		return failure("ANTIGRAVITY_HOOK_JSON_INVALID");
	}

	if (!isRecord(payload)) return failure("ANTIGRAVITY_HOOK_INPUT_ROOT_INVALID");
	const allowedFields = new Set([...COMMON_FIELDS, ...EVENT_FIELDS[event]]);
	if (Object.keys(payload).some((field) => !allowedFields.has(field))) {
		return failure("ANTIGRAVITY_HOOK_INPUT_FIELD_UNSUPPORTED");
	}

	const requiredFields = [...COMMON_FIELDS, ...REQUIRED_EVENT_FIELDS[event]];
	if (requiredFields.some((field) => !Object.hasOwn(payload, field))) {
		return failure("ANTIGRAVITY_HOOK_INPUT_FIELD_MISSING");
	}
	if (!hasValidCommonFields(payload)) return failure("ANTIGRAVITY_HOOK_INPUT_FIELD_TYPE_INVALID");

	switch (event) {
		case "PreInvocation":
			if (!isCounter(payload.invocationNum) || !isCounter(payload.initialNumSteps)) {
				return failure("ANTIGRAVITY_HOOK_INPUT_FIELD_TYPE_INVALID");
			}
			return success({
				event,
				conversationId: payload.conversationId,
				workspacePaths: [...payload.workspacePaths],
				artifactDirectoryPath: payload.artifactDirectoryPath,
				invocationNum: payload.invocationNum,
				initialNumSteps: payload.initialNumSteps,
			});
		case "Stop": {
			const errorIsValid = !Object.hasOwn(payload, "error") || typeof payload.error === "string";
			if (
				!isCounter(payload.executionNum) ||
				typeof payload.terminationReason !== "string" ||
				payload.terminationReason.length === 0 ||
				typeof payload.fullyIdle !== "boolean" ||
				!errorIsValid
			) {
				return failure("ANTIGRAVITY_HOOK_INPUT_FIELD_TYPE_INVALID");
			}
			const value = {
				event,
				conversationId: payload.conversationId,
				workspacePaths: [...payload.workspacePaths],
				artifactDirectoryPath: payload.artifactDirectoryPath,
				executionNum: payload.executionNum,
				terminationReason: payload.terminationReason,
				fullyIdle: payload.fullyIdle,
			};
			return success(Object.hasOwn(payload, "error") ? { ...value, error: payload.error } : value);
		}
	}
}

function hasValidCommonFields(payload) {
	return (
		typeof payload.conversationId === "string" &&
		payload.conversationId.length > 0 &&
		Array.isArray(payload.workspacePaths) &&
		payload.workspacePaths.every((workspacePath) => typeof workspacePath === "string" && workspacePath.length > 0) &&
		typeof payload.transcriptPath === "string" &&
		payload.transcriptPath.length > 0 &&
		typeof payload.artifactDirectoryPath === "string" &&
		payload.artifactDirectoryPath.length > 0
	);
}

function isCounter(value) {
	return Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function success(value) {
	return { ok: true, value };
}

function failure(code) {
	return { ok: false, error: { code } };
}
