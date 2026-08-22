/**
 * Strict Evidence Verification Contract
 * Prevents automated completion on unverified, partial, or fabricated evidence.
 */
export function isStrictEvidenceStatus(status) {
    return status === "verified" || status === "partial" || status === "not_checked" || status === "inference";
}
function parseRanges(rawRanges) {
    if (!Array.isArray(rawRanges))
        return [];
    const result = [];
    for (const item of rawRanges) {
        if (item && typeof item === "object" && typeof item["file"] === "string") {
            const record = item;
            const file = record["file"].trim();
            const startLine = typeof record["startLine"] === "number" ? record["startLine"] : undefined;
            const endLine = typeof record["endLine"] === "number" ? record["endLine"] : undefined;
            result.push({
                file,
                ...(startLine !== undefined ? { startLine } : {}),
                ...(endLine !== undefined ? { endLine } : {}),
            });
        }
    }
    return result;
}
function parseChecksums(rawChecksums) {
    if (!Array.isArray(rawChecksums))
        return [];
    const result = [];
    for (const item of rawChecksums) {
        if (item && typeof item === "object" && typeof item["file"] === "string") {
            const record = item;
            const sha256 = typeof record["sha256"] === "string" ? record["sha256"].trim().toLowerCase() : "";
            if (sha256.length === 64) {
                result.push({ file: record["file"].trim(), sha256 });
            }
        }
    }
    return result;
}
function parseExecutionBinding(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return undefined;
    const value = raw;
    const strings = ["requestId", "runId", "sessionId", "toolCallId", "startedAt", "finishedAt", "stdoutFingerprint", "stderrFingerprint"];
    if (!strings.every((key) => typeof value[key] === "string" && value[key].trim() !== ""))
        return undefined;
    if (typeof value["exitCode"] !== "number" || !Number.isInteger(value["exitCode"]))
        return undefined;
    return {
        requestId: value["requestId"],
        runId: value["runId"],
        sessionId: value["sessionId"],
        toolCallId: value["toolCallId"],
        startedAt: value["startedAt"],
        finishedAt: value["finishedAt"],
        exitCode: value["exitCode"],
        stdoutFingerprint: value["stdoutFingerprint"],
        stderrFingerprint: value["stderrFingerprint"],
    };
}
function parseCommandAudits(rawAudits) {
    if (!Array.isArray(rawAudits))
        return [];
    const result = [];
    for (const item of rawAudits) {
        if (item && typeof item === "object" && typeof item["command"] === "string") {
            const record = item;
            const command = record["command"].trim();
            const exitCode = typeof record["exitCode"] === "number" ? record["exitCode"] : undefined;
            const outputSnippet = typeof record["outputSnippet"] === "string" ? record["outputSnippet"] : undefined;
            result.push({
                command,
                ...(exitCode !== undefined ? { exitCode } : {}),
                ...(outputSnippet !== undefined ? { outputSnippet } : {}),
            });
        }
    }
    return result;
}
export function validateStrictEvidence(evidence) {
    if (!evidence || typeof evidence !== "object") {
        return { valid: false, error: "Evidence must be an object." };
    }
    const raw = evidence;
    const status = raw["status"];
    if (!status || !isStrictEvidenceStatus(status)) {
        return {
            valid: false,
            error: `Invalid evidence status: "${status}". Must be one of: verified, partial, not_checked, inference.`,
        };
    }
    const summary = typeof raw["summary"] === "string" ? raw["summary"].trim() : "";
    if (!summary) {
        return { valid: false, error: "Evidence summary is required and cannot be empty." };
    }
    const readRanges = parseRanges(raw["readRanges"]);
    const unreadRanges = parseRanges(raw["unreadRanges"]);
    const unknowns = Array.isArray(raw["unknowns"])
        ? raw["unknowns"].filter((u) => typeof u === "string" && u.trim().length > 0)
        : [];
    const inferences = Array.isArray(raw["inferences"])
        ? raw["inferences"].filter((i) => typeof i === "string" && i.trim().length > 0)
        : [];
    // Rule 1: 'verified' evidence must NOT contain any unread ranges, unknowns, or inferences
    if (status === "verified") {
        if (unreadRanges.length > 0) {
            return {
                valid: false,
                error: `Evidence marked as 'verified' cannot contain unreadRanges (${unreadRanges.length} found). Mark as 'partial' instead.`,
            };
        }
        if (unknowns.length > 0) {
            return {
                valid: false,
                error: `Evidence marked as 'verified' cannot contain unknowns (${unknowns.length} found). Mark as 'partial' or resolve unknowns.`,
            };
        }
        if (inferences.length > 0) {
            return {
                valid: false,
                error: `Evidence marked as 'verified' cannot contain inferences (${inferences.length} found). Mark as 'inference' or verify factually.`,
            };
        }
    }
    // Rule 2: 'partial', 'not_checked', 'inference' evidence MUST explicitly document gaps
    if (status === "partial" || status === "not_checked" || status === "inference") {
        const hasGapsDocumented = unreadRanges.length > 0 || unknowns.length > 0 || inferences.length > 0;
        if (!hasGapsDocumented) {
            return {
                valid: false,
                error: `Evidence marked as '${status}' must explicitly document at least one unreadRange, unknown, or inference gap.`,
            };
        }
    }
    const executionBinding = parseExecutionBinding(raw["executionBinding"]);
    const envelope = {
        status,
        summary,
        ...(typeof raw["workspaceRoot"] === "string" ? { workspaceRoot: raw["workspaceRoot"].trim() } : {}),
        readRanges,
        unreadRanges,
        unknowns,
        inferences,
        filesChanged: Array.isArray(raw["filesChanged"]) ? raw["filesChanged"] : [],
        fileChecksums: parseChecksums(raw["fileChecksums"]),
        commandsRun: Array.isArray(raw["commandsRun"]) ? raw["commandsRun"] : [],
        commandAudits: parseCommandAudits(raw["commandAudits"]),
        ...(executionBinding !== undefined ? { executionBinding } : {}),
        dryRunSafety: Boolean(raw["dryRunSafety"]),
    };
    return { valid: true, envelope };
}
