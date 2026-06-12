import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LedgerEvent } from "./control-plane-types.js";

export interface StagnationPolicy {
	recentEventWindow: number;
	repeatedErrorThreshold: number;
	repeatedPatchThreshold: number;
	oscillationWindow: number;
	heartbeatOnlyThreshold: number;
	noEvidenceProgressThreshold: number;
	actionOnStagnation: string;
	minimumEventsForDetection: number;
	cooldownEventsAfterDetection: number;
	requireSameAgentForRepeatedError: boolean;
	requireSameRoleForOscillation: boolean;
	ignoreHeartbeatOnlyWhenRoleIsWaiting: boolean;
	defaultSeverity: string;
}

export const DEFAULT_STAGNATION_POLICY: StagnationPolicy = {
	recentEventWindow: 10,
	repeatedErrorThreshold: 3,
	repeatedPatchThreshold: 3,
	oscillationWindow: 4,
	heartbeatOnlyThreshold: 5,
	noEvidenceProgressThreshold: 5,
	actionOnStagnation: "emit_event",
	minimumEventsForDetection: 5,
	cooldownEventsAfterDetection: 5,
	requireSameAgentForRepeatedError: true,
	requireSameRoleForOscillation: true,
	ignoreHeartbeatOnlyWhenRoleIsWaiting: true,
	defaultSeverity: "high",
};

export type StagnationStatus =
	| "ok"
	| "stagnation_candidate"
	| "same_error_loop"
	| "oscillation_detected"
	| "heartbeat_only_stall"
	| "no_evidence_progress";

export interface StagnationDetectedPayload {
	runId: string;
	agentId?: string;
	role?: string;
	kind: string;
	severity: string;
	fingerprint: string;
	matchedEventIds: string[];
	windowSize: number;
	threshold: number;
	suggestedParentAction: string;
	parentActionRequired: boolean;
	mustNotAutoFailRun: boolean;
	wouldSwitchModel: boolean;
	timestamp: string;
}

export interface StagnationResult {
	status: StagnationStatus;
	details?: string;
	payload?: StagnationDetectedPayload;
}

export async function loadStagnationPolicy(repoRoot: string): Promise<StagnationPolicy> {
	const policyPath = join(repoRoot, "plugins", "omo", "components", "ulw-loop", "config", "stagnation-policy.json");
	if (existsSync(policyPath)) {
		try {
			const content = await readFile(policyPath, "utf8");
			const parsed = JSON.parse(content) as Partial<StagnationPolicy>;
			return { ...DEFAULT_STAGNATION_POLICY, ...parsed };
		} catch {
			return DEFAULT_STAGNATION_POLICY;
		}
	}
	return DEFAULT_STAGNATION_POLICY;
}

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
			const res = event.result as any;
			// Detect error
			if (res.error || res.stderr || res.errorCode) {
				errorHash = hashPayload({ error: res.error, stderr: res.stderr, errorCode: res.errorCode });
			}
			// Detect patch / commands
			if (res.diff || res.filesChanged?.length > 0 || res.command || res.commandsRun?.length > 0) {
				patchHash = hashPayload({
					diff: res.diff,
					filesChanged: res.filesChanged,
					command: res.command,
					commandsRun: res.commandsRun,
				});
				hasEvidence = true; // patches or commands count as evidence of work
			}
			if (res.artifactsGenerated?.length > 0) {
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

	let _heartbeatCount = 0;
	let _progressCount = 0;
	let _evidenceCount = 0;

	const errorHashes: { hash: string; agent: string | undefined }[] = [];
	const patchHashes: { hash: string; role: string | undefined }[] = [];

	for (const ev of recentEvents) {
		if (!ev) continue;
		if (ev.type === "agent.heartbeat") {
			_heartbeatCount++;
		}

		const { errorHash, patchHash, hasEvidence, hasProgress } = extractFingerprints(ev);

		if (hasProgress) _progressCount++;
		if (hasEvidence) _evidenceCount++;
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
		matchedEventIds: [], // We don't have event IDs yet in LedgerEvent by default, mock it
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
			if (policy.ignoreHeartbeatOnlyWhenRoleIsWaiting && ev.state === "waiting") {
				// skip
			} else {
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
