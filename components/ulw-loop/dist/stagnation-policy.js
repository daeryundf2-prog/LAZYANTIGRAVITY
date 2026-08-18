import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const DEFAULT_STAGNATION_POLICY = {
    recentEventWindow: 10,
    repeatedErrorThreshold: 3,
    repeatedPatchThreshold: 3,
    oscillationWindow: 4,
    heartbeatOnlyThreshold: 5,
    noEvidenceProgressThreshold: 5,
    actionOnStagnation: "emit_event",
    minimumEventsForDetection: 5,
    cooldownEventsAfterDetection: 5,
    requireSameAgentForRepeatedError: true,
    requireSameRoleForOscillation: true,
    ignoreHeartbeatOnlyWhenRoleIsWaiting: true,
    defaultSeverity: "high",
};
export async function loadStagnationPolicy(repoRoot) {
    const policyPath = join(repoRoot, "plugins", "omo", "components", "ulw-loop", "config", "stagnation-policy.json");
    if (existsSync(policyPath)) {
        try {
            const content = await readFile(policyPath, "utf8");
            const parsed = JSON.parse(content);
            return { ...DEFAULT_STAGNATION_POLICY, ...parsed };
        }
        catch {
            return DEFAULT_STAGNATION_POLICY;
        }
    }
    return DEFAULT_STAGNATION_POLICY;
}
