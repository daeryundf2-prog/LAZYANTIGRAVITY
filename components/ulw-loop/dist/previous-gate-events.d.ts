import { type CheckpointQualityGateResult } from "./checkpoint-reconciliation.js";
import type { LedgerEvent, QualityEvidenceEnvelope } from "./control-plane-types.js";
import type { UlwLoopScope } from "./paths.js";
import type { UlwLoopItem, UlwLoopPlan } from "./types.js";
export declare function checkPriorGateEvents(repoRoot: string, runId: string, events: readonly LedgerEvent[], fingerprint: string, plan: UlwLoopPlan, goal: UlwLoopItem, evidence: string, evidenceEnvelope: QualityEvidenceEnvelope, now: string, args: {
    readonly codexGoalJson?: string;
    readonly qualityGateJson?: string;
}, scope?: UlwLoopScope): Promise<CheckpointQualityGateResult | null>;
