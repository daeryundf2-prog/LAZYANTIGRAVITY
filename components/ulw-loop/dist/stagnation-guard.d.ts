import type { LedgerEvent } from "./control-plane-types.js";
import { DEFAULT_STAGNATION_POLICY, type StagnationDetectedPayload, type StagnationPolicy, type StagnationResult, type StagnationStatus, loadStagnationPolicy } from "./stagnation-policy.js";
export type { StagnationDetectedPayload, StagnationPolicy, StagnationResult, StagnationStatus };
export { DEFAULT_STAGNATION_POLICY, loadStagnationPolicy };
export declare function checkStagnation(events: LedgerEvent[], policy: StagnationPolicy): StagnationResult;
