import { validateStrictEvidence } from "./evidence-contract.js";
import { verifyEvidenceGroundTruth } from "./evidence-verifier.js";
import type { QualityGateResult, VerificationContext, VerificationPolicy } from "./verification-pipeline-types.js";

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
					reason:
						"Mechanical verification failed: Policy requires automated tests, but no test execution command was found in evidence",
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

export function runSemanticGate(ctx: VerificationContext, policy?: VerificationPolicy): QualityGateResult {
	if (!ctx.evidence) {
		return { stage: "semantic", status: "failed", reason: "Missing evidence envelope", parentActionRequired: true };
	}

	if (!ctx.goal || ctx.goal.trim() === "") {
		return { stage: "semantic", status: "failed", reason: "Goal is empty", parentActionRequired: true };
	}
	if (!ctx.evidence.summary || ctx.evidence.summary.trim() === "") {
		return { stage: "semantic", status: "failed", reason: "Summary is empty", parentActionRequired: true };
	}

	if (ctx.evidence.status) {
		const validation = validateStrictEvidence(ctx.evidence);
		if (!validation.valid) {
			return {
				stage: "semantic",
				status: "failed",
				reason: `Evidence contract validation failed: ${validation.error}`,
				parentActionRequired: true,
			};
		}
		if (validation.envelope) {
			const groundTruth = verifyEvidenceGroundTruth(process.cwd(), validation.envelope, ctx.events);
			if (!groundTruth.verified) {
				return {
					stage: "semantic",
					status: "failed",
					reason: `Evidence ground-truth verification failed: ${groundTruth.error}`,
					parentActionRequired: true,
				};
			}
		}
	}

	if (ctx.evidence.filesChanged.length === 0 && ctx.evidence.summary.includes("modified files")) {
		return {
			stage: "semantic",
			status: "failed",
			reason: "Summary claims modifications but filesChanged is empty",
			parentActionRequired: true,
		};
	}

	const minFactuality = policy?.minFactualityScore ?? 0.85;
	if (typeof ctx.evidence.factualityScore === "number" && ctx.evidence.factualityScore < minFactuality) {
		const thresholdStr = (minFactuality * 100) % 1 === 0 ? `${(minFactuality * 100).toFixed(0)}%` : `${(minFactuality * 100).toFixed(1)}%`;
		return {
			stage: "semantic",
			status: "failed",
			reason: `SAFE factuality score (${(ctx.evidence.factualityScore * 100).toFixed(1)}%) is below required ${thresholdStr} threshold`,
			parentActionRequired: true,
		};
	}

	if (policy?.requireFactualityScore && typeof ctx.evidence.factualityScore !== "number") {
		return {
			stage: "semantic",
			status: "failed",
			reason: "Policy requires SAFE factuality score, but none was recorded in evidence",
			parentActionRequired: true,
		};
	}

	if (policy?.requireCoveVerification && ctx.evidence.coveVerified !== true) {
		return {
			stage: "semantic",
			status: "failed",
			reason: "Policy requires CoVe verification, but evidence was not verified by CoVe",
			parentActionRequired: true,
		};
	}

	if (ctx.evidence.coveVerified === false) {
		return {
			stage: "semantic",
			status: "failed",
			reason: "CoVe verification failed: contradictions found during verification",
			parentActionRequired: true,
		};
	}

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

	if (ctx.wouldSwitchModel) {
		return {
			stage: "semantic",
			status: "failed",
			reason: "Auto-switching models is forbidden",
			parentActionRequired: true,
		};
	}

	if (ctx.isDryRun && !ctx.evidence.dryRunSafety) {
		return { stage: "semantic", status: "failed", reason: "DryRun safety block", parentActionRequired: true };
	}

	return { stage: "semantic", status: "passed" };
}
