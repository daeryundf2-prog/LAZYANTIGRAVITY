import { createHash } from "node:crypto";
import type { LedgerEvent } from "./control-plane-types.js";
import {
	DEFAULT_STAGNATION_POLICY,
	type StagnationDetectedPayload,
	type StagnationPolicy,
	type StagnationResult,
	type StagnationStatus,
	loadStagnationPolicy,
} from "./stagnation-policy.js";

export type { StagnationDetectedPayload, StagnationPolicy, StagnationResult, StagnationStatus };
export { DEFAULT_STAGNATION_POLICY, loadStagnationPolicy };

function hashPayload(payload: unknown): string {
	if (payload === undefined || payload === null) return "";
	const str = typeof payload === "string" ? payload : JSON.stringify(payload);
	return createHash("sha256").update(str).digest("hex");
}

function extractFingerprints(event: LedgerEvent) {
	let errorHash = "";
	let patchHash = "";
	let hasEvidence = false;
	let hasProgress = false;

	if (
		event.type === "agent.progress" ||
		event.type === "agent.completed_reported" ||
		event.type === "agent.failed_reported"
	) {
		hasProgress = true;
		if (event.result && typeof event.result === "object") {
			const res = event.result as Record<string, unknown>;
			const error = res["error"];
			const stderr = res["stderr"];
			const errorCode = res["errorCode"];
			const errValue = typeof error === "string" ? error : "";
			const stderrValue = typeof stderr === "string" ? stderr : "";
			const errorCodeValue = typeof errorCode === "string" ? errorCode : "";
			if (errValue || stderrValue || errorCodeValue) {
				errorHash = hashPayload({ error: errValue, stderr: stderrValue, errorCode: errorCodeValue });
			}
			const diff = res["diff"];
			const diffValue = typeof diff === "string" ? diff : "";
			const filesChanged = Array.isArray(res["filesChanged"])
				? res["filesChanged"].filter((f): f is string => typeof f === "string")
				: [];
			const command = res["command"];
			const commandValue = typeof command === "string" ? command : "";
			const commandsRun = Array.isArray(res["commandsRun"])
				? res["commandsRun"].filter((c): c is string => typeof c === "string")
				: [];
			if (diffValue || filesChanged.length > 0 || commandValue || commandsRun.length > 0) {
				patchHash = hashPayload({ diff: diffValue, filesChanged, command: commandValue, commandsRun });
				hasEvidence = true;
			}
			const artifactsGenerated = Array.isArray(res["artifactsGenerated"])
				? res["artifactsGenerated"].filter((a): a is string => typeof a === "string")
				: [];
			if (artifactsGenerated.length > 0) {
				hasEvidence = true;
			}
		}
		if (event.type === "agent.failed_reported" && event.reason && !errorHash) {
			errorHash = hashPayload(event.reason);
		}
	}

	return { errorHash, patchHash, hasEvidence, hasProgress };
}

export function checkStagnation(events: LedgerEvent[], policy: StagnationPolicy): StagnationResult {
	if (events.length < policy.minimumEventsForDetection) return { status: "ok" };

	const recentEvents = events.slice(-policy.recentEventWindow);
	const runId = recentEvents[recentEvents.length - 1]?.runId || "";
	const agentId = recentEvents[recentEvents.length - 1]?.agentId;
	const role = recentEvents[recentEvents.length - 1]?.role;

	const errorHashes: { hash: string; agent: string | undefined }[] = [];
	const patchHashes: { hash: string; role: string | undefined }[] = [];

	for (const ev of recentEvents) {
		if (!ev) continue;
		const { errorHash, patchHash } = extractFingerprints(ev);
		if (errorHash) errorHashes.push({ hash: errorHash, agent: ev.agentId });
		if (patchHash) patchHashes.push({ hash: patchHash, role: ev.role });
	}

	const buildPayload = (
		kind: string,
		fingerprint: string,
		windowSize: number,
		threshold: number,
		suggestedParentAction: string,
	): StagnationDetectedPayload => ({
		runId,
		...(agentId ? { agentId } : {}),
		...(role ? { role } : {}),
		kind,
		severity: policy.defaultSeverity,
		fingerprint,
		matchedEventIds: [],
		windowSize,
		threshold,
		suggestedParentAction,
		parentActionRequired: true,
		mustNotAutoFailRun: true,
		wouldSwitchModel: false,
		timestamp: new Date().toISOString(),
	});

	// 1. Same error loop
	if (errorHashes.length >= policy.repeatedErrorThreshold) {
		const lastNErrors = errorHashes.slice(-policy.repeatedErrorThreshold);
		const firstErr = lastNErrors[0]?.hash;
		const firstAgent = lastNErrors[0]?.agent;
		if (
			lastNErrors.every(
				(h) => h.hash === firstErr && (!policy.requireSameAgentForRepeatedError || h.agent === firstAgent),
			)
		) {
			return {
				status: "same_error_loop",
				details: "Repeated identical error hash detected.",
				payload: buildPayload(
					"same_error_loop",
					firstErr || "none",
					policy.recentEventWindow,
					policy.repeatedErrorThreshold,
					"pause_or_replan",
				),
			};
		}
	}

	// 2. Oscillation (A -> B -> A -> B)
	if (patchHashes.length >= policy.oscillationWindow) {
		const recentPatches = patchHashes.slice(-policy.oscillationWindow);
		const A = recentPatches[recentPatches.length - 4]?.hash;
		const B = recentPatches[recentPatches.length - 3]?.hash;
		const A2 = recentPatches[recentPatches.length - 2]?.hash;
		const B2 = recentPatches[recentPatches.length - 1]?.hash;
		const roleA = recentPatches[recentPatches.length - 4]?.role;

		if (
			recentPatches.length >= 4 &&
			A === A2 &&
			B === B2 &&
			A !== B &&
			(!policy.requireSameRoleForOscillation || recentPatches.slice(-4).every((p) => p.role === roleA))
		) {
			return {
				status: "oscillation_detected",
				details: "A/B/A/B patch oscillation detected.",
				payload: buildPayload(
					"oscillation_detected",
					`${A}-${B}`,
					policy.recentEventWindow,
					policy.oscillationWindow,
					"pause_or_replan",
				),
			};
		}
	}

	// 3. Heartbeat-only stall
	let consecutiveHeartbeats = 0;
	for (let i = recentEvents.length - 1; i >= 0; i--) {
		const ev = recentEvents[i];
		if (!ev) continue;
		if (ev.type === "agent.heartbeat") {
			if (!(policy.ignoreHeartbeatOnlyWhenRoleIsWaiting && ev.state === "waiting")) {
				consecutiveHeartbeats++;
			}
		} else {
			break;
		}
	}
	if (consecutiveHeartbeats >= policy.heartbeatOnlyThreshold) {
		return {
			status: "heartbeat_only_stall",
			details: "Agent is sending heartbeats without progress.",
			payload: buildPayload(
				"heartbeat_only_stall",
				"heartbeat",
				policy.recentEventWindow,
				policy.heartbeatOnlyThreshold,
				"pause_or_replan",
			),
		};
	}

	// 4. No evidence progress
	let consecutiveProgressNoEvidence = 0;
	for (let i = recentEvents.length - 1; i >= 0; i--) {
		const ev = recentEvents[i];
		if (!ev) continue;
		if (ev.type === "agent.progress") {
			const { hasEvidence } = extractFingerprints(ev);
			if (!hasEvidence) {
				consecutiveProgressNoEvidence++;
			} else {
				break;
			}
		} else if (ev.type !== "agent.heartbeat") {
			break;
		}
	}
	if (consecutiveProgressNoEvidence >= policy.noEvidenceProgressThreshold) {
		return {
			status: "no_evidence_progress",
			details: "Agent is reporting progress but providing no evidence.",
			payload: buildPayload(
				"no_evidence_progress",
				"progress_no_evidence",
				policy.recentEventWindow,
				policy.noEvidenceProgressThreshold,
				"pause_or_replan",
			),
		};
	}

	return { status: "ok" };
}
