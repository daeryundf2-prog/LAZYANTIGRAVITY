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
	| "parent.hitl_required"
	| "quality_gate.started"
	| "quality_gate.mechanical_passed"
	| "quality_gate.mechanical_failed"
	| "quality_gate.consensus_required"
	| "quality_gate.consensus_started"
	| "quality_gate.consensus_persona_dispatched"
	| "quality_gate.consensus_persona_reported"
	| "quality_gate.consensus_persona_conflict"
	| "quality_gate.consensus_passed"
	| "quality_gate.consensus_failed"
	| "quality_gate.consensus_rework_required"
	| "quality_gate.consensus_inconclusive"
	| "quality_gate.completed"
	| "quality_gate.failed"
	| "quality_gate.production_readiness_verified"
	| "run.completed"
	| "run.failed";

export interface LedgerEvent {
	eventId?: string;
	causationId?: string;
	correlationId?: string;
	prevHash?: string;
	hash?: string;

	// P2: HITL Context
	hitlId?: string;
	hitlReason?: string;
	previousState?: string;
	resumeTargetState?: string;
	requestedBy?: string;
	requiredUserAction?: string;
	parentActionRequired?: boolean;
	mustNotAutoResume?: boolean;

	// P3: Lineage Context
	attemptId?: string;
	parentAttemptId?: string;
	branchId?: string;
	rewindTargetEventId?: string;
	supersedesAttemptId?: string;
	createdFromEventId?: string;

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

	// P4: Consensus Fields
	consensusId?: string;
	persona?: string;
	envelope?: unknown;
	wouldSwitchModel?: boolean;
	finalizerAllowed?: boolean;
	missingPersonas?: string[];
	isMockLive?: boolean;
	prompt?: string | undefined;
	traceId?: string | undefined;
	traceParent?: string | undefined;
	durationCreateSessionMs?: number | undefined;
	durationSendMessageMs?: number | undefined;
	durationPollMs?: number | undefined;
	totalDurationMs?: number | undefined;
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
	hitlReason?: string;
	activeHitlId?: string;
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
	status?: "verified" | "partial" | "not_checked" | "inference";
	readRanges?: Array<{ file: string; startLine?: number; endLine?: number }>;
	unreadRanges?: Array<{ file: string; startLine?: number; endLine?: number }>;
	unknowns?: string[];
	inferences?: string[];
	factualityScore?: number;
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
