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
}

export const DEFAULT_STAGNATION_POLICY: StagnationPolicy = {
	recentEventWindow: 10,
	repeatedErrorThreshold: 3,
	repeatedPatchThreshold: 3,
	oscillationWindow: 4,
	heartbeatOnlyThreshold: 5,
	noEvidenceProgressThreshold: 5,
	actionOnStagnation: "emit_event",
};

export type StagnationStatus =
	| "ok"
	| "stagnation_candidate"
	| "same_error_loop"
	| "oscillation_detected"
	| "heartbeat_only_stall"
	| "no_evidence_progress";

export interface StagnationResult {
	status: StagnationStatus;
	details?: string;
}

export async function loadStagnationPolicy(repoRoot: string): Promise<StagnationPolicy> {
	const policyPath = join(repoRoot, "plugins", "omo", "components", "ulw-loop", "config", "stagnation-policy.json");
	if (existsSync(policyPath)) {
		try {
			const content = await readFile(policyPath, "utf8");
			return JSON.parse(content) as StagnationPolicy;
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

	if (event.type === "agent.progress" || event.type === "agent.completed_reported" || event.type === "agent.failed_reported") {
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
	if (events.length === 0) return { status: "ok" };

	const recentEvents = events.slice(-policy.recentEventWindow);
	
	let heartbeatCount = 0;
	let progressCount = 0;
	let evidenceCount = 0;

	const errorHashes: string[] = [];
	const patchHashes: string[] = [];

	for (const ev of recentEvents) {
		if (ev.type === "agent.heartbeat") {
			heartbeatCount++;
		}
		
		const { errorHash, patchHash, hasEvidence, hasProgress } = extractFingerprints(ev);
		
		if (hasProgress) progressCount++;
		if (hasEvidence) evidenceCount++;
		if (errorHash) errorHashes.push(errorHash);
		if (patchHash) patchHashes.push(patchHash);
	}

	// 1. Same error loop
	if (errorHashes.length >= policy.repeatedErrorThreshold) {
		// Check if the last N errors are identical
		const lastNErrors = errorHashes.slice(-policy.repeatedErrorThreshold);
		const firstErr = lastNErrors[0];
		if (lastNErrors.every((h) => h === firstErr)) {
			return { status: "same_error_loop", details: "Repeated identical error hash detected." };
		}
	}

	// 2. Oscillation (A -> B -> A -> B)
	if (patchHashes.length >= policy.oscillationWindow) {
		const recentPatches = patchHashes.slice(-policy.oscillationWindow);
		// A simple A-B-A-B check: recentPatches[0] === recentPatches[2] and recentPatches[1] === recentPatches[3]
		if (
			recentPatches.length >= 4 &&
			recentPatches[recentPatches.length - 4] === recentPatches[recentPatches.length - 2] &&
			recentPatches[recentPatches.length - 3] === recentPatches[recentPatches.length - 1] &&
			recentPatches[recentPatches.length - 4] !== recentPatches[recentPatches.length - 3]
		) {
			return { status: "oscillation_detected", details: "A/B/A/B patch oscillation detected." };
		}
	}

	// 3. Heartbeat-only stall
	// If the last N events are ONLY heartbeats
	let consecutiveHeartbeats = 0;
	for (let i = recentEvents.length - 1; i >= 0; i--) {
		const ev = recentEvents[i];
		if (!ev) continue;
		if (ev.type === "agent.heartbeat") {
			consecutiveHeartbeats++;
		} else {
			break;
		}
	}
	if (consecutiveHeartbeats >= policy.heartbeatOnlyThreshold) {
		return { status: "heartbeat_only_stall", details: "Agent is sending heartbeats without progress." };
	}

	// 4. No evidence progress
	// If we have many progress events but NO evidence (patches, commands)
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
		return { status: "no_evidence_progress", details: "Agent is reporting progress but providing no evidence." };
	}

	return { status: "ok" };
}
