const ENV_PREFIX_CANONICAL = "SMTW_";
const ENV_PREFIX_LEGACY = "FABLE_LITE_";
const KNOWN_VARS = [
	{ canonical: "SMTW_TEST_FORCE_ENABLE", legacy: "FABLE_LITE_TEST_FORCE_ENABLE" },
	{ canonical: "SMTW_PROJECT_ROOT", legacy: "FABLE_LITE_PROJECT_ROOT" },
	{ canonical: "SMTW_HOST", legacy: "FABLE_LITE_HOST" },
	{ canonical: "SMTW_SESSION_ID", legacy: "FABLE_LITE_SESSION_ID" },
	{ canonical: "SMTW_AGENT", legacy: "FABLE_LITE_AGENT" },
];

export function checkEnvironmentConflicts() {
	const conflicts = [];
	for (const { canonical, legacy } of KNOWN_VARS) {
		const canonicalValue = process.env[canonical];
		const legacyValue = process.env[legacy];
		if (canonicalValue !== undefined && legacyValue !== undefined && canonicalValue !== legacyValue) {
			conflicts.push({
				canonical_var: canonical,
				legacy_var: legacy,
				canonical_value: "[REDACTED]" ,
				legacy_value: "[REDACTED]",
				message: `Conflict: ${canonical} and ${legacy} are both set but disagree. Fail-closed.`,
			});
		}
	}
	return {
		conflicts,
		conflict_count: conflicts.length,
		failed_closed: conflicts.length > 0,
	};
}

export function getEnvVar(name) {
	const canonical = process.env[ENV_PREFIX_CANONICAL + name];
	const legacy = process.env[ENV_PREFIX_LEGACY + name];
	if (canonical !== undefined && legacy !== undefined && canonical !== legacy) {
		return undefined;
	}
	return canonical ?? legacy;
}
