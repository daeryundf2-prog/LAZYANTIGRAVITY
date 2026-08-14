const SENSITIVE_VALUE_REGEX = /(?:sk-|ghp_|gho_)[a-zA-Z0-9_-]{12,}|\beyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\b|(?:Authorization:\s*Bearer\s+|password=|api_key=|token=)[a-zA-Z0-9._-]+|\btoken_secret_[a-zA-Z0-9_-]+\b/gi;
export function stripSensitiveData(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (typeof obj === "string") {
        return obj.replace(SENSITIVE_VALUE_REGEX, "[REDACTED]");
    }
    if (Array.isArray(obj)) {
        return obj.map(stripSensitiveData);
    }
    if (typeof obj === "object") {
        const result = {};
        for (const key of Object.keys(obj)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes("token") ||
                lowerKey.includes("password") ||
                lowerKey.includes("secret") ||
                lowerKey.includes("credential") ||
                lowerKey.includes("apikey") ||
                lowerKey.includes("jwt") ||
                lowerKey.includes("privatekey") ||
                lowerKey.includes("sessiontoken")) {
                result[key] = "[REDACTED]";
            }
            else {
                result[key] = stripSensitiveData(obj[key]);
            }
        }
        return result;
    }
    return obj;
}
