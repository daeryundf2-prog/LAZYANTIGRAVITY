import { formatAntigravityHookDiagnostic } from "./antigravity-hooks/diagnostic.mjs";
import { parseAntigravityHookInput } from "./antigravity-hooks/input.mjs";
import { collectPreInvocationOmoContext } from "./antigravity-hooks/context.mjs";
import { formatEmptyPreInvocationResponse, formatEphemeralMessageResponse } from "./antigravity-hooks/output.mjs";
import { runAntigravityStopContinuation } from "./antigravity-hooks/stop-continuation.mjs";

const event = process.argv[2];
let rawInput = "";

process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) rawInput += chunk;

const parsed = parseAntigravityHookInput(event, rawInput);
if (!parsed.ok) {
	process.stderr.write(formatAntigravityHookDiagnostic(parsed.error));
	process.exitCode = 2;
} else {
	const response = selectResponse(parsed.value);
	if (!response.ok) {
		process.stderr.write(formatAntigravityHookDiagnostic(response.error));
		process.exitCode = 2;
	} else {
		process.stdout.write(response.value);
	}
}

function selectResponse(hookInput) {
	switch (hookInput.event) {
		case "PreInvocation":
			return selectPreInvocationResponse(hookInput);
		case "Stop":
			return success(runAntigravityStopContinuation(hookInput).stdout);
	}
}

function selectPreInvocationResponse(hookInput) {
	const context = collectPreInvocationOmoContext(hookInput);
	if (!context.ok) return context;
	return success(context.value ? formatEphemeralMessageResponse(context.value) : formatEmptyPreInvocationResponse());
}

function success(value) {
	return { ok: true, value };
}
