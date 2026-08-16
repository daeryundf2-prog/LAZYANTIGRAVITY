const SENSITIVE_VALUE_REGEX =
	/(?:sk-|ghp_|gho_|xox[bpo]-|AKIA)[a-zA-Z0-9_-]{12,}|\beyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\b|(?:Authorization:\s*Bearer\s+|password=|api_key=|token=)[a-zA-Z0-9._-]+|\btoken_secret_[a-zA-Z0-9_-]+\b|-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/gi;

interface ScrubResult {
	[key: string]: unknown;
}

export function stripSensitiveData<T>(obj: T): T {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj === "string") {
		return obj.replace(SENSITIVE_VALUE_REGEX, "[REDACTED]") as T;
	}
	if (Array.isArray(obj)) {
		return obj.map(stripSensitiveData) as T;
	}
	if (typeof obj === "object") {
		const result: ScrubResult = {};
		for (const key of Object.keys(obj as Record<string, unknown>)) {
			const lowerKey = key.toLowerCase();
			if (
				lowerKey.includes("token") ||
				lowerKey.includes("password") ||
				lowerKey.includes("secret") ||
				lowerKey.includes("credential") ||
				lowerKey.includes("apikey") ||
				lowerKey.includes("jwt") ||
				lowerKey.includes("privatekey") ||
				lowerKey.includes("sessiontoken")
			) {
				result[key] = "[REDACTED]";
			} else {
				result[key] = stripSensitiveData((obj as Record<string, unknown>)[key]);
			}
		}
		return result as T;
	}
	return obj;
}
