import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
