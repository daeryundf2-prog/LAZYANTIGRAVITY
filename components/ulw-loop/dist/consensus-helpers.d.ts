import type { ConsensusResultEnvelope } from "./verification-pipeline-types.js";
export declare function validateConsensusSchema(envelope: Record<string, unknown>): void;
export declare function isConsensusResultEnvelope(x: unknown): x is ConsensusResultEnvelope;
export declare function getEnvelopeHash(envelope: ConsensusResultEnvelope): string;
