import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FORBIDDEN_PHRASES } from "./control-plane.js";
import type { LedgerEvent, QualityEvidenceEnvelope } from "./control-plane-types.js";
import {
	type ConsensusResultEnvelope,
	DEFAULT_VERIFICATION_POLICY,
	type QualityGateResult,
	type VerificationPolicy,
} from "./verification-pipeline-types.js";

export async function loadVerificationPolicy(repoRoot: string): Promise<VerificationPolicy> {
	const policyPath = join(repoRoot, "plugins", "omo", "components", "ulw-loop", "config", "verification-policy.json");
	if (existsSync(policyPath)) {
		try {
			const content = await readFile(policyPath, "utf8");
			const parsed = JSON.parse(content) as Partial<VerificationPolicy>;
			return { ...DEFAULT_VERIFICATION_POLICY, ...parsed };
		} catch {
			return DEFAULT_VERIFICATION_POLICY;
		}
	}
	return DEFAULT_VERIFICATION_POLICY;
}

export interface VerificationContext {
	runId: string;
	events: LedgerEvent[];
	evidence?: QualityEvidenceEnvelope;
	goal?: string;
	wouldSwitchModel?: boolean;
	isDryRun?: boolean;
	riskLevel?: "low" | "medium" | "high";
	destructiveChange?: boolean;
	publicRelease?: boolean;
	securitySensitive?: boolean;
	lspDiagnostics?: string[] | undefined;
	rulesViolations?: string[] | undefined;
}

export function runMechanicalGate(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult {
	if (!ctx.evidence) {
		return {
			stage: "mechanical",
			status: "failed",
			reason: "Missing evidence envelope",
			parentActionRequired: true,
		};
	}

	const { commandsRun, filesChanged } = ctx.evidence;

	// Enforce that any code change must be accompanied by executed verification commands
	if (filesChanged && filesChanged.length > 0) {
		if (!commandsRun || commandsRun.length === 0) {
			return {
				stage: "mechanical",
				status: "failed",
				reason: "Mechanical verification failed: Changes made to files but no verification commands were executed",
				parentActionRequired: true,
			};
		}

		if (policy.requireTests) {
			const hasTestRun = commandsRun.some((cmd) =>
				/\b(test|vitest|jest|pytest|cargo\s+test|go\s+test|npm\s+test|bun\s+test)\b/i.test(cmd),
			);
			if (!hasTestRun) {
				return {
					stage: "mechanical",
					status: "failed",
					reason: "Mechanical verification failed: Policy requires automated tests, but no test execution command was found in evidence",
					parentActionRequired: true,
				};
			}
		}
	}

	return {
		stage: "mechanical",
		status: "passed",
	};
}

export function runSemanticGate(ctx: VerificationContext, _policy: VerificationPolicy): QualityGateResult {
	if (!ctx.evidence) {
		return { stage: "semantic", status: "failed", reason: "Missing evidence envelope", parentActionRequired: true };
	}

	// 1. task goal과 summary가 비어 있지 않음
	if (!ctx.goal || ctx.goal.trim() === "") {
		return { stage: "semantic", status: "failed", reason: "Goal is empty", parentActionRequired: true };
	}
	if (!ctx.evidence.summary || ctx.evidence.summary.trim() === "") {
		return { stage: "semantic", status: "failed", reason: "Summary is empty", parentActionRequired: true };
	}

	// 2. filesChanged가 실제 변경 주장과 일치 (간단히 length > 0 이면 ok로 판단. 여기서는 모의 검증)
	if (ctx.evidence.filesChanged.length === 0 && ctx.evidence.summary.includes("modified files")) {
		return {
			stage: "semantic",
			status: "failed",
			reason: "Summary claims modifications but filesChanged is empty",
			parentActionRequired: true,
		};
	}

	// 3. completedRoles와 parent.acknowledged 이벤트 일치 (간이 검증)
	// (추후 구현)

	// 4. unresolved parent.stagnation_detected 이벤트가 있으면 finalize 차단
	const stagnationEvents = ctx.events.filter((e) => e.type === "parent.stagnation_detected");
	if (stagnationEvents.length > 0) {
		const lastStagnationEvent = stagnationEvents[stagnationEvents.length - 1];
		if (lastStagnationEvent?.fingerprint) {
			const fp = lastStagnationEvent.fingerprint;
			const lastStagnationIndex = ctx.events.lastIndexOf(lastStagnationEvent);
			const eventsAfterStagnation = ctx.events.slice(lastStagnationIndex + 1);
			const hasResolution = eventsAfterStagnation.some(
				(e) =>
					(e.type === "parent.resumed" || e.type === "parent.acknowledged" || e.type === "parent.rejected") &&
					e.fingerprint === fp,
			);
			if (!hasResolution) {
				return {
					stage: "semantic",
					status: "failed",
					reason: "Unresolved stagnation detected",
					parentActionRequired: true,
				};
			}
		}
	}

	// 5. Antigravity에서 wouldSwitchModel=true가 있으면 실패
	if (ctx.wouldSwitchModel) {
		return {
			stage: "semantic",
			status: "failed",
			reason: "Auto-switching models is forbidden",
			parentActionRequired: true,
		};
	}

	// 6. dryRun checkpoint가 운영 resume 대상이면 실패
	if (ctx.isDryRun && !ctx.evidence.dryRunSafety) {
		return { stage: "semantic", status: "failed", reason: "DryRun safety block", parentActionRequired: true };
	}

	return { stage: "semantic", status: "passed" };
}

export function runConsensusGate(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult {
	// Consensus Gate는 스켈레톤만 구현
	const hasUnresolvedStagnation = false; // already blocked by semantic gate mostly, but could be passed down

	const needsConsensus =
		(ctx.riskLevel === "high" && policy.consensusTriggers.riskLevelHigh) ||
		(ctx.destructiveChange && policy.consensusTriggers.destructiveChange) ||
		(ctx.publicRelease && policy.consensusTriggers.publicRelease) ||
		(ctx.securitySensitive && policy.consensusTriggers.securitySensitive) ||
		hasUnresolvedStagnation;

	if (needsConsensus) {
		return {
			stage: "consensus",
			status: "required",
			reason: "High risk change detected. Consensus subagent required.",
			parentActionRequired: true,
		};
	}

	return {
		stage: "consensus",
		status: "skipped",
	};
}

export function validateConsensusResultEnvelope(
	envelope: unknown,
	expectedRunId: string,
	expectedConsensusId: string,
): ConsensusResultEnvelope {
	if (!envelope || typeof envelope !== "object") throw new Error("Invalid envelope: must be an object");
	const env = envelope as ConsensusResultEnvelope & {
		mayFinalizeRun?: boolean;
		mayChangeModel?: boolean;
		wouldSwitchModel?: boolean;
		verdict?: string;
	};

	if (env.runId !== expectedRunId) throw new Error(`Run ID mismatch: expected ${expectedRunId}, got ${env.runId}`);
	if (env.consensusId !== expectedConsensusId)
		throw new Error(`Consensus ID mismatch: expected ${expectedConsensusId}, got ${env.consensusId}`);

	if (env.requiresParentAck !== true) throw new Error("Validation rejected: requiresParentAck must be true");
	if (env.mayFinalizeRun === true) throw new Error("Validation rejected: consensus subagents cannot finalize run");
	if (env.mayChangeModel === true) throw new Error("Validation rejected: consensus subagents cannot switch models");
	if (env.wouldSwitchModel === true) throw new Error("Validation rejected: consensus subagents cannot switch models");

	if (!["approve", "reject", "needs_rework", "inconclusive"].includes(env.verdict || "")) {
		throw new Error(`Invalid verdict: ${env.verdict}`);
	}

	const texts = [env.reason || "", env.verdict || ""];
	for (const text of texts) {
		for (const pattern of FORBIDDEN_PHRASES) {
			if (pattern.test(text)) throw new Error(`Forbidden phrase detected: "${text}" matched ${pattern.toString()}`);
		}
	}

	if (/run\.completed|run\.failed/i.test(env.reason || "")) {
		throw new Error("Validation rejected: consensus subagent cannot assert run.completed or run.failed directly");
	}

	return env as ConsensusResultEnvelope;
}

export function calculateConsensusVerdict(results: ConsensusResultEnvelope[]): {
	type: string;
	finalizerAllowed: boolean;
	parentActionRequired?: boolean;
} {
	if (results.length === 0)
		return { type: "quality_gate.consensus_inconclusive", finalizerAllowed: false, parentActionRequired: true };

	let allApprove = true;
	for (const result of results) {
		if (result.verdict === "reject") return { type: "quality_gate.consensus_failed", finalizerAllowed: false };
		if (result.verdict === "needs_rework")
			return { type: "quality_gate.consensus_rework_required", finalizerAllowed: false };
		if (result.verdict === "inconclusive")
			return { type: "quality_gate.consensus_inconclusive", finalizerAllowed: false, parentActionRequired: true };
		if (result.verdict !== "approve") allApprove = false;
	}

	if (allApprove) return { type: "quality_gate.consensus_passed", finalizerAllowed: true };

	return { type: "quality_gate.consensus_inconclusive", finalizerAllowed: false, parentActionRequired: true };
}

export function calculateQualityFingerprint(evidence: QualityEvidenceEnvelope): string {
	return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

export function runVerificationPipeline(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult[] {
	if (ctx.evidence) {
		const fingerprint = calculateQualityFingerprint(ctx.evidence);
		const existingResult = ctx.events.find(
			(e) =>
				(e.type === "quality_gate.completed" ||
					e.type === "quality_gate.failed" ||
					e.type === "quality_gate.consensus_required") &&
				e.qualityInputFingerprint === fingerprint,
		);

		if (existingResult) {
			// Idempotency: Return an array reflecting the skipped status or previous status
			// We return blocked here to indicate it shouldn't proceed again if it failed
			if (existingResult.type === "quality_gate.failed") {
				return [
					{
						stage: "mechanical",
						status: "failed",
						reason: "Already failed for this fingerprint",
						parentActionRequired: true,
					},
				];
			}
			if (existingResult.type === "quality_gate.consensus_required") {
				return [
					{
						stage: "consensus",
						status: "required",
						reason: "Already requires consensus for this fingerprint",
						parentActionRequired: true,
					},
				];
			}
			// If it completed, we return passed
			return [{ stage: "all" as any, status: "passed", reason: "Already completed for this fingerprint" }];
		}
	}

	const results: QualityGateResult[] = [];

	// 1. Mechanical
	const mechResult = runMechanicalGate(ctx, policy);
	results.push(mechResult);
	if (mechResult.status === "failed") {
		return results; // 파이프라인 중단
	}

	// 2. Semantic
	const semResult = runSemanticGate(ctx, policy);
	results.push(semResult);
	if (semResult.status === "failed") {
		return results; // 파이프라인 중단
	}

	// 3. Consensus
	const conResult = runConsensusGate(ctx, policy);
	results.push(conResult);

	return results;
}
