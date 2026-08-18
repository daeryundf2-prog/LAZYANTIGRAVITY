import type { QualityGateResult, VerificationPolicy } from "./verification-pipeline-types.js";
import type { VerificationContext } from "./verification-pipeline-types.js";
export declare function runMechanicalGate(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult;
export declare function runSemanticGate(ctx: VerificationContext, _policy: VerificationPolicy): QualityGateResult;
