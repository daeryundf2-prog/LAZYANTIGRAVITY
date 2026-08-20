import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FORBIDDEN_PHRASES } from "./control-plane.js";
import { runMechanicalGate, runSemanticGate } from "./verification-gates.js";
import {
	type ConsensusResultEnvelope,
	DEFAULT_VERIFICATION_POLICY,
	type QualityGateResult,
	type VerificationContext,
	type VerificationPolicy,
} from "./verification-pipeline-types.js";

export type { VerificationContext };
export { runMechanicalGate, runSemanticGate };

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

export function calculateQualityFingerprint(evidence?: VerificationContext["evidence"]): string {
	if (!evidence) return "";
	return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
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

export function runConsensusGate(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult {
	const needsConsensus =
		(ctx.riskLevel === "high" && policy.consensusTriggers.riskLevelHigh) ||
		(ctx.destructiveChange && policy.consensusTriggers.destructiveChange) ||
		(ctx.publicRelease && policy.consensusTriggers.publicRelease) ||
		(ctx.securitySensitive && policy.consensusTriggers.securitySensitive);

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
			return [
				{ stage: "mechanical", status: "passed", reason: "Already completed for this fingerprint" },
				{ stage: "semantic", status: "passed", reason: "Already completed for this fingerprint" },
				{ stage: "consensus", status: "passed", reason: "Already completed for this fingerprint" },
			];
		}
	}

	const results: QualityGateResult[] = [];

	const mechResult = runMechanicalGate(ctx, policy);
	results.push(mechResult);
	if (mechResult.status === "failed") {
		return results;
	}

	const semResult = runSemanticGate(ctx, policy);
	results.push(semResult);
	if (semResult.status === "failed") {
		return results;
	}

	const conResult = runConsensusGate(ctx, policy);
	results.push(conResult);

	return results;
}
