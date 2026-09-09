import { UlwLoopError } from "./types.js";
const BLOCKER_FIELD_KEYS = "blocker blockerSignature blockerEvidence blockerOccurrences blockedAt".split(" ");
const URL_PATTERN = /https?:\/\/\S+/g;
const PUNCTUATION_PATTERN = /[`"'()[\]{}:,;]/g;
const WHITESPACE_PATTERN = /\s+/g;
const AUTH_PATTERN = /\b(auth\w*|credential\w*|token|permission\w*|scope\w*|access|unauthorized|forbidden|401|403)\b/;
const MISSING_PATTERN = /\b(unset|missing|required|requires|without|omit\w*|not set|not available|no read packages|read packages)\b/;
const GHCR_PATTERN = /\b(ghcr|github container registry|read packages|imagepullsecret|package api|anonymous|container image)\b/;
const GHCR_401_PATTERN = /\b(401|unauthorized|anonymous pull|authentication required)\b/;
const GHCR_403_PATTERN = /\b(403|forbidden|read packages|package api)\b/;
const UNCONDITIONAL_APPROVAL_PATTERN = /\bUNCONDITIONAL\s+APPROVAL\b/i;
function invalid(message, field) {
    throw new UlwLoopError(message, "ULW_LOOP_QUALITY_GATE_INVALID", { details: { field } });
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function checkReviewerField({ value, field, expectedValue, evidenceApproved, addDefect, }) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") {
            if (evidenceApproved)
                return expectedValue;
            addDefect(field, `${field} must be ${expectedValue} or codeReview.evidence should include UNCONDITIONAL APPROVAL.`);
            return null;
        }
        if (trimmed === expectedValue)
            return expectedValue;
        addDefect(field, `${field} must be ${expectedValue}.`);
        return null;
    }
    if (value === undefined) {
        if (evidenceApproved)
            return expectedValue;
        addDefect(field, `${field} must be ${expectedValue} or codeReview.evidence should include UNCONDITIONAL APPROVAL.`);
        return null;
    }
    addDefect(field, `${field} must be ${expectedValue}.`);
    return null;
}
export function validateQualityGate(input) {
    const defects = [];
    const addDefect = (field, message) => {
        defects.push({ field, message });
    };
    if (!isRecord(input)) {
        invalid("Final quality gate is missing qualityGate evidence.", "qualityGate");
    }
    const gate = isRecord(input["qualityGate"]) ? input["qualityGate"] : input;
    const cleaner = isRecord(gate["aiSlopCleaner"]) ? gate["aiSlopCleaner"] : null;
    if (!cleaner) {
        addDefect("aiSlopCleaner", "Final quality gate is missing aiSlopCleaner evidence.");
    }
    else {
        if (cleaner["status"] !== "passed") {
            addDefect("aiSlopCleaner.status", "aiSlopCleaner.status must be passed.");
        }
        if (typeof cleaner["evidence"] !== "string" || cleaner["evidence"].trim() === "") {
            addDefect("aiSlopCleaner.evidence", "Final quality gate requires non-empty aiSlopCleaner.evidence.");
        }
    }
    let commands = [];
    const verification = isRecord(gate["verification"]) ? gate["verification"] : null;
    if (!verification) {
        addDefect("verification", "Final quality gate is missing verification evidence.");
    }
    else {
        if (verification["status"] !== "passed") {
            addDefect("verification.status", "verification.status must be passed.");
        }
        if (!Array.isArray(verification["commands"]) || verification["commands"].length === 0) {
            addDefect("verification.commands", "Final quality gate requires verification.commands.");
        }
        else {
            commands = verification["commands"].map(String);
        }
        if (typeof verification["evidence"] !== "string" || verification["evidence"].trim() === "") {
            addDefect("verification.evidence", "Final quality gate requires non-empty verification.evidence.");
        }
    }
    let recommendation = "APPROVE";
    let architectStatus = "CLEAR";
    let reviewEvidence = "";
    const review = isRecord(gate["codeReview"]) ? gate["codeReview"] : null;
    if (!review) {
        addDefect("codeReview", "Final quality gate is missing codeReview evidence.");
    }
    else {
        if (typeof review["evidence"] !== "string" || review["evidence"].trim() === "") {
            addDefect("codeReview.evidence", "Final quality gate requires non-empty codeReview.evidence.");
        }
        else {
            reviewEvidence = review["evidence"];
        }
        const approvalEvidence = UNCONDITIONAL_APPROVAL_PATTERN.test(reviewEvidence);
        const rec = checkReviewerField({
            value: review["recommendation"],
            field: "codeReview.recommendation",
            expectedValue: "APPROVE",
            evidenceApproved: approvalEvidence,
            addDefect,
        });
        if (rec)
            recommendation = rec;
        const arch = checkReviewerField({
            value: review["architectStatus"],
            field: "codeReview.architectStatus",
            expectedValue: "CLEAR",
            evidenceApproved: approvalEvidence,
            addDefect,
        });
        if (arch)
            architectStatus = arch;
    }
    let totalCriteria = 0;
    let passCount = 0;
    let covered = [];
    const coverage = isRecord(gate["criteriaCoverage"]) ? gate["criteriaCoverage"] : null;
    if (!coverage) {
        addDefect("criteriaCoverage", "Final quality gate is missing criteriaCoverage evidence.");
    }
    else {
        if (typeof coverage["totalCriteria"] !== "number" || !Number.isFinite(coverage["totalCriteria"])) {
            addDefect("criteriaCoverage.totalCriteria", "Final quality gate requires numeric criteriaCoverage.totalCriteria.");
        }
        else {
            totalCriteria = coverage["totalCriteria"];
        }
        if (typeof coverage["passCount"] !== "number" || !Number.isFinite(coverage["passCount"])) {
            addDefect("criteriaCoverage.passCount", "Final quality gate requires numeric criteriaCoverage.passCount.");
        }
        else {
            passCount = coverage["passCount"];
        }
        if (passCount < totalCriteria) {
            addDefect("criteriaCoverage.passCount", "criteriaCoverage.passCount must cover totalCriteria.");
        }
        if (!Array.isArray(coverage["adversarialClassesCovered"]) || coverage["adversarialClassesCovered"].length === 0) {
            addDefect("criteriaCoverage.adversarialClassesCovered", "Final quality gate requires criteriaCoverage.adversarialClassesCovered.");
        }
        else {
            covered = coverage["adversarialClassesCovered"].map(String);
        }
    }
    const first = defects[0];
    if (first) {
        const messages = defects.map((d) => `[${d.field}] ${d.message}`).join("; ");
        const fullMessage = defects.length === 1
            ? first.message
            : `Final quality gate validation failed with ${defects.length} defect(s): ${messages}`;
        throw new UlwLoopError(fullMessage, "ULW_LOOP_QUALITY_GATE_INVALID", {
            details: {
                field: first.field,
                defects: defects.map((d) => d.field),
                defectMessages: defects,
            },
        });
    }
    const result = {
        aiSlopCleaner: { status: "passed", evidence: cleaner?.["evidence"] || "" },
        verification: { status: "passed", commands, evidence: verification?.["evidence"] || "" },
        codeReview: { recommendation, architectStatus, evidence: reviewEvidence },
    };
    Object.assign(result, { criteriaCoverage: { totalCriteria, passCount, adversarialClassesCovered: covered } });
    return result;
}
export function normalizeBlockerEvidence(evidence) {
    const withoutUrls = evidence.toLowerCase().replace(URL_PATTERN, " ");
    const withoutPunctuation = withoutUrls.replace(PUNCTUATION_PATTERN, " ");
    return withoutPunctuation.replace(WHITESPACE_PATTERN, " ").trim();
}
export function classifyExternalAuthorizationBlocker(evidence) {
    const normalized = normalizeBlockerEvidence(evidence);
    if (!normalized || !AUTH_PATTERN.test(normalized) || !MISSING_PATTERN.test(normalized))
        return null;
    if (!GHCR_PATTERN.test(normalized))
        return "EXTERNAL_AUTHORIZATION_REQUIRED";
    const status401 = GHCR_401_PATTERN.test(normalized) ? "HTTP_401_ANONYMOUS" : null;
    const status403 = GHCR_403_PATTERN.test(normalized) ? "HTTP_403_NO_READ_PACKAGES" : null;
    const status = [status401, status403].filter((part) => part !== null).join("+");
    return `GHCR_PULL_ACCESS:${status || "AUTHORIZATION_REQUIRED"}:GHCR_VISIBILITY_OR_CREDENTIAL_REQUIRED`;
}
function nestedBlockerSignature(goal) {
    const blocker = Reflect.get(goal, "blocker");
    const signature = isRecord(blocker) ? blocker["signature"] : null;
    return typeof signature === "string" ? signature : null;
}
export function sameBlockerOccurrences(plan, signature) {
    return plan.goals.filter((goal) => goal.blockerSignature === signature || nestedBlockerSignature(goal) === signature)
        .length;
}
export function clearGoalBlockerFields(goal) {
    for (const key of BLOCKER_FIELD_KEYS)
        Reflect.deleteProperty(goal, key);
}
