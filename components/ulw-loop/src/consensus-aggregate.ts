import { ALL_PERSONAS } from "./consensus-types.js";
import { appendRunEvent, readRunEvents } from "./control-plane.js";
import { UlwLoopError } from "./types.js";
import { calculateConsensusVerdict } from "./verification-pipeline.js";
import type { ConsensusResultEnvelope } from "./verification-pipeline-types.js";

export async function aggregateConsensus(repoRoot: string, runId: string, consensusId: string): Promise<string> {
	const events = await readRunEvents(repoRoot, runId);

	const terminalTypes = [
		"quality_gate.consensus_passed",
		"quality_gate.consensus_failed",
		"quality_gate.consensus_rework_required",
		"quality_gate.consensus_inconclusive",
	];
	const existingTerminal = events.find((e) => terminalTypes.includes(e.type) && e.consensusId === consensusId);
	if (existingTerminal) {
		if (existingTerminal.type === "quality_gate.consensus_passed") return "consensus_passed";
		if (existingTerminal.type === "quality_gate.consensus_failed") return "consensus_failed";
		if (existingTerminal.type === "quality_gate.consensus_rework_required") return "consensus_rework_required";
		if (existingTerminal.type === "quality_gate.consensus_inconclusive") return "consensus_inconclusive";
	}

	const startedEvent = events.find(
		(e) => e.type === "quality_gate.consensus_started" && e.consensusId === consensusId,
	);
	const qualityInputFingerprint = startedEvent?.qualityInputFingerprint;
	const isMockLive = startedEvent?.isMockLive || false;
	const traceId = startedEvent?.traceId;
	const traceParent = startedEvent?.traceParent;

	const results: ConsensusResultEnvelope[] = [];
	for (const event of events) {
		if (event.type === "quality_gate.consensus_persona_reported" && event.consensusId === consensusId) {
			results.push(event.result as ConsensusResultEnvelope);
		}
	}

	const hasConflict = events.some(
		(e) => e.type === "quality_gate.consensus_persona_conflict" && e.consensusId === consensusId,
	);

	const reportedPersonas = new Set(results.map((r) => r.persona));
	const missing = ALL_PERSONAS.filter((p) => !reportedPersonas.has(p));

	let verdict: string;
	let finalizerAllowed = false;
	let parentActionRequired = false;

	if (hasConflict) {
		verdict = "consensus_failed";
		finalizerAllowed = false;
		parentActionRequired = true;
	} else if (missing.length > 0) {
		verdict = "consensus_inconclusive";
		finalizerAllowed = false;
		parentActionRequired = true;
	} else {
		const v = calculateConsensusVerdict(results);
		verdict = v.type.replace("quality_gate.", "");
		finalizerAllowed = v.finalizerAllowed;
		if (v.parentActionRequired) {
			parentActionRequired = true;
		}
	}

	let eventType:
		| "quality_gate.consensus_passed"
		| "quality_gate.consensus_failed"
		| "quality_gate.consensus_rework_required"
		| "quality_gate.consensus_inconclusive";

	switch (verdict) {
		case "consensus_passed":
			eventType = "quality_gate.consensus_passed";
			break;
		case "consensus_failed":
			eventType = "quality_gate.consensus_failed";
			break;
		case "consensus_rework_required":
			eventType = "quality_gate.consensus_rework_required";
			break;
		case "consensus_inconclusive":
			eventType = "quality_gate.consensus_inconclusive";
			break;
		default:
			throw new UlwLoopError(`Unknown verdict ${verdict}`, "ULW_LOOP_CONSENSUS_VERDICT_UNKNOWN");
	}

	await appendRunEvent(repoRoot, runId, eventType, {
		consensusId,
		finalizerAllowed,
		...(parentActionRequired && { parentActionRequired: true }),
		result: results,
		...(missing.length > 0 && { missingPersonas: missing }),
		wouldSwitchModel: false,
		isMockLive,
		traceId,
		traceParent,
		...(qualityInputFingerprint && { qualityInputFingerprint }),
	});

	return verdict;
}
