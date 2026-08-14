export const DEFAULT_VERIFICATION_POLICY = {
    requireTests: true,
    requireLint: true,
    consensusTriggers: {
        riskLevelHigh: true,
        destructiveChange: true,
        publicRelease: true,
        securitySensitive: true,
    },
};
