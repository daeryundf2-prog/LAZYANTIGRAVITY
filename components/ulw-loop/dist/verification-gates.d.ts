import type { QualityGateResult, VerificationContext, VerificationPolicy } from "./verification-pipeline-types.js";
export declare function runMechanicalGate(ctx: VerificationContext, policy: VerificationPolicy): QualityGateResult;
export declare function runSemanticGate(ctx: VerificationContext, policy?: VerificationPolicy): QualityGateResult;
