import { formatAntigravityHookDiagnostic } from "./antigravity-hooks/diagnostic.mjs";
import { parseAntigravityHookInput } from "./antigravity-hooks/input.mjs";
import { collectPreInvocationOmoContext } from "./antigravity-hooks/context.mjs";
import { formatEmptyPreInvocationResponse, formatEphemeralMessageResponse, formatStopResponse, formatContinueResponse, formatPreToolUseAllowResponse, formatPreToolUseDenyResponse, formatPreToolUseAskResponse, formatPostToolUseResponse } from "./antigravity-hooks/output.mjs";
import { runAntigravityStopContinuation } from "./antigravity-hooks/stop-continuation.mjs";
import { runStopVerificationGate } from "./antigravity-hooks/work-supervisor/stop-verification.mjs";
import { evaluateR2Gate } from "./antigravity-hooks/work-supervisor/destructive-guard.mjs";
import { addQuarantine } from "./antigravity-hooks/work-supervisor/quarantine.mjs";
import { recordInvocation, appendLedgerEntry } from "./antigravity-hooks/work-supervisor/audit-ledger.mjs";
import { runScopeDriftCheck, captureRequestedScope } from "./antigravity-hooks/work-supervisor/scope-drift.mjs";
import { evaluateAmbiguity, checkInvestigationCompliance, formatInvestigationDirective, formatAmbiguityDirective, evaluateR1Contract, hasIntent, hasGoals } from "./antigravity-hooks/work-supervisor/investigation-discipline.mjs";
import { registerTurn, touchTurn, evaluateStaleMutation, settleTurn } from "./antigravity-hooks/work-supervisor/stale-mutation.mjs";
import { checkEnvironmentConflicts } from "./antigravity-hooks/work-supervisor/runtime-env.mjs";
import { blockOnce, recoverGate } from "./antigravity-hooks/work-supervisor/gate-counters.mjs";

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
			return selectStopResponse(hookInput);
		case "PreToolUse":
			return selectPreToolUseResponse(hookInput);
		case "PostToolUse":
			return selectPostToolUseResponse(hookInput);
	}
}

function selectStopResponse(hookInput) {
	const workspaceRoot = hookInput.workspacePaths?.[0];
	const agentKey = `antigravity:${hookInput.conversationId}`;

	if (workspaceRoot) {
		settleTurn(workspaceRoot, agentKey);
	}

	const continuation = runAntigravityStopContinuation(hookInput);
	if (continuation.stdout && continuation.stdout.includes('"decision":"continue"')) {
		return success(continuation.stdout);
	}
	const verification = runStopVerificationGate(hookInput);
	if (verification.decision === "continue") {
		return success(formatContinueResponse(verification.reason));
	}
	if (workspaceRoot) {
		appendLedgerEntry(workspaceRoot, {
			type: "verification",
			agent_key: agentKey,
			decision: verification.decision,
		});
		recoverGate(workspaceRoot, agentKey, "r1_contract");
		recoverGate(workspaceRoot, agentKey, "stop_verification");
	}
	return success(formatStopResponse());
}

function selectPreToolUseResponse(hookInput) {
	const toolName = hookInput.toolCall?.name;
	const toolArgs = hookInput.toolCall?.args || {};
	const conversationId = hookInput.conversationId;
	const workspaceRoot = hookInput.workspacePaths?.[0];
	const agentKey = `antigravity:${conversationId}`;

	captureRequestedScope(hookInput);

	if (workspaceRoot) {
		touchTurn(workspaceRoot, agentKey);
		const staleResult = evaluateStaleMutation(workspaceRoot, agentKey);
		if (staleResult.decision === "deny") {
			return success(formatPreToolUseDenyResponse(staleResult.reason));
		}
	}

	if (toolName === "run_command" && workspaceRoot) {
		const command = toolArgs.CommandLine || "";
		if (command) {
			const r2Result = evaluateR2Gate(workspaceRoot, command, agentKey);
			if (r2Result.decision === "deny") {
				addQuarantine(workspaceRoot, {
					command,
					agent_key: agentKey,
					reason: r2Result.reason,
					tool: toolName,
				});
				return success(formatPreToolUseDenyResponse(r2Result.reason));
			}
			const r1Result = evaluateR1Contract(workspaceRoot, {
				prompt: "",
				file_paths: [],
				command,
			});
			if (r1Result.decision === "block") {
				const gateResult = blockOnce(workspaceRoot, agentKey, "r1_contract");
				if (gateResult.blocked) {
					return success(formatPreToolUseDenyResponse(r1Result.reason));
				}
			}
		}
	}

	if (workspaceRoot && toolName !== "run_command") {
		const targetFile = toolArgs.TargetFile || toolArgs.DirectoryPath;
		if (targetFile) {
			const r1Result = evaluateR1Contract(workspaceRoot, {
				prompt: "",
				file_paths: [targetFile],
				command: toolName,
			});
			if (r1Result.decision === "block") {
				const gateResult = blockOnce(workspaceRoot, agentKey, "r1_contract");
				if (gateResult.blocked) {
					return success(formatPreToolUseDenyResponse(r1Result.reason));
				}
			}
		}
	}

	if (workspaceRoot) {
		const targetFile = toolArgs.TargetFile || toolArgs.DirectoryPath;
		if (targetFile) {
			recordInvocation(workspaceRoot, {
				agentKey,
				host: "antigravity",
				sessionId: conversationId,
				agent: "default",
				paths: [targetFile],
				command: toolName,
			});
		}
	}

	return success(formatPreToolUseAllowResponse());
}

function selectPostToolUseResponse(hookInput) {
	const driftResult = runScopeDriftCheck(hookInput);
	if (driftResult.warning) {
		process.stderr.write(`scope-drift: ${driftResult.warning}\n`);
	}
	return success(formatPostToolUseResponse(driftResult.warning));
}

function selectPreInvocationResponse(hookInput) {
	const parts = [];

	const envConflicts = checkEnvironmentConflicts();
	if (envConflicts.failed_closed) {
		parts.push(`<env-conflict>\n${envConflicts.conflicts.map((c) => c.message).join("\n")}\n</env-conflict>`);
	}

	const context = collectPreInvocationOmoContext(hookInput);
	if (context.ok && context.value) parts.push(context.value);

	const workspaceRoot = hookInput.workspacePaths?.[0];
	const agentKey = `antigravity:${hookInput.conversationId}`;

	if (workspaceRoot) {
		registerTurn(workspaceRoot, agentKey);
		touchTurn(workspaceRoot, agentKey);
	}

	if (hookInput.invocationNum === 0 && workspaceRoot) {
		if (!hasIntent(workspaceRoot) && !hasGoals(workspaceRoot)) {
			parts.push(formatInvestigationDirective());
		}
	}

	if (parts.length === 0) return success(formatEmptyPreInvocationResponse());
	return success(formatEphemeralMessageResponse(parts.join("\n\n")));
}

function success(value) {
	return { ok: true, value };
}
