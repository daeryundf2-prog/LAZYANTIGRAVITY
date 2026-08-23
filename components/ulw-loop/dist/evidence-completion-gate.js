import { readJsonInput } from "./checkpoint-reconciliation.js";
import { validateStrictEvidence } from "./evidence-contract.js";
import { verifyEvidenceGroundTruth } from "./evidence-verifier.js";
import { UlwLoopError } from "./types.js";
export async function assertGroundTruthEvidence(repoRoot, qualityGateJson, events, claimedEvidence) {
    const raw = await readJsonInput(qualityGateJson, repoRoot);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new UlwLoopError("Ground-Truth evidence contract is required for completion.", "ULW_LOOP_EVIDENCE_REQUIRED");
    }
    const candidate = raw["evidenceContract"] ?? raw;
    const validated = validateStrictEvidence(candidate);
    if (!validated.valid || validated.envelope === undefined) {
        throw new UlwLoopError(validated.error ?? "Evidence contract validation failed.", "ULW_LOOP_EVIDENCE_INVALID");
    }
    const envelope = validated.envelope;
    if (!envelope.readRanges?.length ||
        !envelope.fileChecksums?.length ||
        !envelope.commandsRun?.length ||
        !envelope.commandAudits?.length) {
        throw new UlwLoopError("Completion evidence must include readRanges, fileChecksums, commandsRun, and commandAudits.", "ULW_LOOP_EVIDENCE_INCOMPLETE");
    }
    const binding = envelope.executionBinding;
    if (binding === undefined || binding.exitCode !== 0) {
        throw new UlwLoopError("Completion evidence must include a Host execution binding with exitCode 0.", "ULW_LOOP_EVIDENCE_BINDING_REQUIRED");
    }
    const completedEvent = [...events].reverse().find((event) => event.type === "agent.completed_reported");
    if (completedEvent === undefined || binding.runId !== completedEvent.runId) {
        throw new UlwLoopError("Evidence execution binding does not belong to the current run.", "ULW_LOOP_EVIDENCE_BINDING_MISMATCH");
    }
    if (claimedEvidence !== undefined) {
        const claimed = [...claimedEvidence.filesChanged].sort();
        const attested = [...(envelope.filesChanged ?? [])].sort();
        const attestedSet = new Set(attested);
        if (claimed.some((file) => !attestedSet.has(file))) {
            throw new UlwLoopError("Every host completion file claim must be present in attested filesChanged.", "ULW_LOOP_EVIDENCE_CLAIM_MISMATCH");
        }
    }
    const audit = verifyEvidenceGroundTruth(repoRoot, envelope, events);
    if (!audit.verified) {
        throw new UlwLoopError(audit.error ?? "Ground-Truth evidence verification failed.", "ULW_LOOP_EVIDENCE_GROUND_TRUTH_FAILED");
    }
}
