import type { UlwLoopScope } from "./paths.js";
import { validateUlwLoopSteeringProposal } from "./steering-validation.js";
import type { SteerUlwLoopResult, UlwLoopPlan, UlwLoopSteeringAudit, UlwLoopSteeringProposal } from "./types.js";
export { validateUlwLoopSteeringProposal };
export declare function applySteeringMutation(plan: UlwLoopPlan, proposal: UlwLoopSteeringProposal, audit: UlwLoopSteeringAudit): UlwLoopPlan;
export declare function parseUlwLoopSteeringDirective(text: string): UlwLoopSteeringProposal | null;
export declare function steerUlwLoop(repoRoot: string, proposal: UlwLoopSteeringProposal, scope?: UlwLoopScope): Promise<SteerUlwLoopResult>;
