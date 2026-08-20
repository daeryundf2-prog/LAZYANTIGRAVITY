import type { LedgerEvent } from "./control-plane-types.js";
import { DEFAULT_STAGNATION_POLICY, loadStagnationPolicy, type StagnationDetectedPayload, type StagnationPolicy, type StagnationResult, type StagnationStatus } from "./stagnation-policy.js";
export type { StagnationDetectedPayload, StagnationPolicy, StagnationResult, StagnationStatus };
export { DEFAULT_STAGNATION_POLICY, loadStagnationPolicy };
export declare function checkStagnation(events: LedgerEvent[], policy: StagnationPolicy): StagnationResult;
