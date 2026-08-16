import type { LiveConsensusClient } from "./consensus-types.js";
export { aggregateConsensus } from "./consensus-aggregate.js";
export { dispatchConsensus, reportConsensusResult } from "./consensus-dispatch.js";
export { getEnvelopeHash, validateConsensusSchema } from "./consensus-helpers.js";
export { MockLiveConsensusClient, setMockPersonaVerdict } from "./consensus-mock-client.js";
export { OpenCodeLiveConsensusClient } from "./consensus-opencode-client.js";
export type { DispatchConsensusOptions, LiveConsensusClient } from "./consensus-types.js";
export { ALL_PERSONAS, CONSENSUS_RESULT_SCHEMA } from "./consensus-types.js";
export declare function triggerLiveConsensus(repoRoot: string, runId: string, consensusId: string, prompt: string, voterTimeoutMs: number, consensusTimeoutMs: number, _qualityInputFingerprint?: string, client?: LiveConsensusClient): Promise<void>;
