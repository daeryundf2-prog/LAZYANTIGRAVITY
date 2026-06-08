export type RunState =
	| "created"
	| "planning"
	| "researching"
	| "working"
	| "verifying"
	| "finalizing"
	| "paused"
	| "completed"
	| "failed"
	| "cancelled";

export type AssignmentState =
	| "pending"
	| "dispatched"
	| "claimed"
	| "running"
	| "waiting"
	| "completed_reported"
	| "failed_reported"
	| "stale_candidate"
	| "orphaned"
	| "acknowledged";

export type EventType =
	| "run.created"
	| "run.state_changed"
	| "agent.dispatched"
	| "agent.claimed"
	| "agent.heartbeat"
	| "agent.progress"
	| "agent.completed_reported"
	| "agent.failed_reported"
	| "parent.acknowledged"
	| "parent.rejected"
	| "parent.paused"
	| "parent.resumed"
	| "parent.stagnation_detected"
	| "quality_gate.started"
	| "quality_gate.mechanical_passed"
	| "quality_gate.mechanical_failed"
	| "quality_gate.semantic_passed"
	| "quality_gate.semantic_failed"
	| "quality_gate.consensus_required"
	| "quality_gate.completed"
	| "quality_gate.failed"
	| "run.completed"
	| "run.failed";

export interface LedgerEvent {
	timestamp: string;
	type: EventType;
	runId: string;
	agentId?: string;
	role?: string;
	state?: string;
	progress?: string;
	result?: unknown;
	reason?: string;
	pollerId?: string;
	fingerprint?: string;
	qualityInputFingerprint?: string;
}

export interface AgentState {
	agentId: string;
	role: string;
	state: AssignmentState;
	dispatchedAt: string;
	claimedAt?: string;
	lastHeartbeat?: string;
	lastProgress?: string;
	lastProgressAt?: string;
	leaseExpiresAt: string;
	result?: unknown;
}

export interface PollerState {
	pollerId: string;
	expiresAt: string;
}

export interface RunStateSchema {
	runId: string;
	state: RunState;
	updatedAt: string;
	agents: Record<string, AgentState>;
	activePoller?: PollerState;
}

export interface LeasePolicy {
	subagentLease: {
		defaultLeaseMs: number;
		maxLeaseMs: number;
		heartbeatIntervalMs: number;
		staleGraceMs: number;
		maxMissedHeartbeats: number;
	};
	pollingGuard: {
		pollerLeaseMs: number;
	};
}

export interface QualityEvidenceEnvelope {
	goal: string;
	summary: string;
	filesChanged: string[];
	commandsRun: string[];
	testResults: string[];
	artifactsGenerated: string[];
	completedRoles: string[];
	acknowledgedRoles: string[];
	dryRunSafety: boolean;
}

export interface SubagentResultEnvelope {
	runId: string;
	agentId: string;
	role: string;
	status: "success" | "failed";
	summary: string;
	filesChanged: string[];
	commandsRun: string[];
	artifactsGenerated: string[];
	blockers: string[];
	nextRecommendedAction: string;
	requiresParentAck: boolean;
}
