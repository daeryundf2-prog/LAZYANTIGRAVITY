import { randomUUID } from "node:crypto";
import { triggerLiveConsensus } from "./consensus-dispatcher.js";
import { getEnvelopeHash } from "./consensus-helpers.js";
import { MockLiveConsensusClient } from "./consensus-mock-client.js";
import { OpenCodeLiveConsensusClient } from "./consensus-opencode-client.js";
import type { DispatchConsensusOptions, LiveConsensusClient } from "./consensus-types.js";
import { ALL_PERSONAS } from "./consensus-types.js";
import { appendRunEvent, readRunEvents, reconstructStateFromEvents } from "./control-plane.js";
import { UlwLoopError } from "./types.js";
import { validateConsensusResultEnvelope } from "./verification-pipeline.js";
import type { ConsensusResultEnvelope } from "./verification-pipeline-types.js";

export async function dispatchConsensus(
	repoRoot: string,
	runId: string,
	qualityInputFingerprint?: string,
	options: DispatchConsensusOptions = {},
): Promise<{ consensusId: string }> {
	const events = await readRunEvents(repoRoot, runId);

	if (qualityInputFingerprint) {
		const existingStarted = events.find(
			(e) => e.type === "quality_gate.consensus_started" && e.qualityInputFingerprint === qualityInputFingerprint,
		);
		if (existingStarted) {
			return { consensusId: existingStarted.consensusId as string };
		}
	}

	const consensusId = randomUUID();
	const isMockLive = !options.live && !!options.mockLive;
	const traceId = randomUUID().replace(/-/g, "");
	const parentId = randomUUID().replace(/-/g, "").substring(0, 16);
	const traceParent = `00-${traceId}-${parentId}-01`;

	await appendRunEvent(repoRoot, runId, "quality_gate.consensus_started", {
		consensusId,
		wouldSwitchModel: false,
		isMockLive,
		traceId,
		traceParent,
		...(qualityInputFingerprint && { qualityInputFingerprint }),
	});

	for (const persona of ALL_PERSONAS) {
		const agentId = `${persona}-${consensusId.substring(0, 8)}`;
		const envelope = {
			runId,
			consensusId,
			agentId,
			persona,
			mayFinalizeRun: false,
			mayModifyGlobalRunState: false,
			mayChangeModel: false,
			wouldSwitchModel: false,
			requiresParentAck: true,
			mustReturn: "ConsensusResultEnvelope",
		};
		await appendRunEvent(repoRoot, runId, "quality_gate.consensus_persona_dispatched", {
			agentId,
			consensusId,
			persona,
			envelope,
			wouldSwitchModel: false,
			isMockLive,
			traceId,
			traceParent,
			...(qualityInputFingerprint && { qualityInputFingerprint }),
		});
	}

	if (options.live || options.mockLive) {
		const prompt = options.prompt;
		if (options.live && !prompt) {
			throw new UlwLoopError("Prompt is required for live invocation", "ULW_LOOP_PROMPT_REQUIRED");
		}
		const voterTimeout = options.voterTimeoutMs || 120000;
		const consensusTimeout = options.consensusTimeoutMs || 150000;
		const opencodeBaseUrl = options.opencodeBaseUrl || process.env["OPENCODE_API_URL"] || "http://127.0.0.1:4096";

		let client: LiveConsensusClient;
		if (options.live) {
			const activeClient = new OpenCodeLiveConsensusClient(opencodeBaseUrl);
			await activeClient.init();
			client = activeClient;
		} else {
			client = new MockLiveConsensusClient(runId, consensusId);
		}

		await triggerLiveConsensus(
			repoRoot,
			runId,
			consensusId,
			prompt || "Verify the workspace changes.",
			voterTimeout,
			consensusTimeout,
			qualityInputFingerprint,
			client,
		);
	}

	return { consensusId };
}

export async function reportConsensusResult(
	repoRoot: string,
	runId: string,
	consensusId: string,
	agentId: string,
	resultJson: unknown,
	isMockLive?: boolean,
	metrics?: {
		durationCreateSessionMs?: number;
		durationSendMessageMs?: number;
		durationPollMs?: number;
	},
): Promise<void> {
	await reconstructStateFromEvents(repoRoot, runId);
	const events = await readRunEvents(repoRoot, runId);

	const envelope = validateConsensusResultEnvelope(resultJson, runId, consensusId);

	if (envelope.agentId !== agentId) {
		throw new UlwLoopError("Agent ID mismatch in ConsensusResultEnvelope", "ULW_LOOP_CONSENSUS_AGENT_MISMATCH");
	}

	const startedEvent = events.find(
		(e) => e.type === "quality_gate.consensus_started" && e.consensusId === consensusId,
	);
	const qualityInputFingerprint = startedEvent?.qualityInputFingerprint;
	const traceId = startedEvent?.traceId;
	const traceParent = startedEvent?.traceParent;

	const envelopeHash = getEnvelopeHash(envelope);

	const alreadyReported = events.find(
		(e) =>
			e.type === "quality_gate.consensus_persona_reported" &&
			e.consensusId === consensusId &&
			e.runId === runId &&
			e.qualityInputFingerprint === qualityInputFingerprint &&
			e.persona === envelope.persona,
	);

	if (alreadyReported) {
		const reportedEnvelope = alreadyReported.result as ConsensusResultEnvelope;
		const reportedHash = getEnvelopeHash(reportedEnvelope);

		if (reportedHash === envelopeHash) {
			return;
		}
		await appendRunEvent(repoRoot, runId, "quality_gate.consensus_persona_conflict", {
			consensusId,
			agentId,
			persona: envelope.persona,
			reason: `Conflict detected for persona ${envelope.persona} in consensus ${consensusId}`,
			wouldSwitchModel: false,
			isMockLive: !!isMockLive || !!alreadyReported.isMockLive,
			traceId,
			traceParent,
			...(qualityInputFingerprint && { qualityInputFingerprint }),
		});
		throw new UlwLoopError(
			"Conflict: Different payload already reported for this persona",
			"ULW_LOOP_CONSENSUS_REPORT_CONFLICT",
		);
	}

	await appendRunEvent(repoRoot, runId, "quality_gate.consensus_persona_reported", {
		consensusId,
		agentId,
		persona: envelope.persona,
		result: envelope,
		wouldSwitchModel: false,
		isMockLive: !!isMockLive,
		traceId,
		traceParent,
		...(metrics && {
			durationCreateSessionMs: metrics.durationCreateSessionMs,
			durationSendMessageMs: metrics.durationSendMessageMs,
			durationPollMs: metrics.durationPollMs,
			totalDurationMs:
				(metrics.durationCreateSessionMs ?? 0) +
				(metrics.durationSendMessageMs ?? 0) +
				(metrics.durationPollMs ?? 0),
		}),
		...(qualityInputFingerprint && { qualityInputFingerprint }),
	});
}
