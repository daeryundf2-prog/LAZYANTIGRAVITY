import {
	formatAntigravityHookDiagnostic,
} from "../../../scripts/antigravity-hooks/diagnostic.mjs";
import { parseAntigravityHookInput } from "../../../scripts/antigravity-hooks/input.mjs";
import {
	formatContinueResponse,
	formatEmptyPreInvocationResponse,
	formatEphemeralMessageResponse,
	formatStopResponse,
} from "../../../scripts/antigravity-hooks/output.mjs";

const event = process.argv[2];
const mode = process.argv[3] ?? "default";
let rawInput = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) rawInput += chunk;

const parsed = parseAntigravityHookInput(event, rawInput);
if (!parsed.ok) {
	process.stderr.write(formatAntigravityHookDiagnostic(parsed.error));
	process.exitCode = 2;
} else {
	const response = selectResponse(event, mode);
	if (response === null) {
		process.stderr.write("ANTIGRAVITY_HOOK_INPUT_INVALID: Hook response mode is invalid.\n");
		process.exitCode = 2;
	} else {
		process.stdout.write(response);
	}
}

function selectResponse(hookEvent, responseMode) {
	switch (`${hookEvent}:${responseMode}`) {
		case "PreInvocation:default":
		case "PreInvocation:empty":
			return formatEmptyPreInvocationResponse();
		case "PreInvocation:inject":
			return formatEphemeralMessageResponse("Remember to lint");
		case "Stop:continue":
			return formatContinueResponse("Not done yet");
		case "Stop:default":
		case "Stop:stop":
			return formatStopResponse();
		default:
			return null;
	}
}
