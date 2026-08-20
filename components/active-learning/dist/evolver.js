import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractFailurePatterns, readFailureEvents } from "./analyzer.js";
export function getMemoryPath(cwd = process.cwd()) {
    const p1 = join(cwd, ".omo", "memory");
    const p2 = join(cwd, ".lazyantigravity", "memory");
    if (existsSync(p1))
        return join(p1, "facts.jsonl");
    if (!existsSync(p2)) {
        mkdirSync(p2, { recursive: true });
    }
    return join(p2, "facts.jsonl");
}
function parseAndValidateEvidence(evidenceInput, cwd) {
    let raw;
    if (typeof evidenceInput === "string") {
        try {
            const resolvedPath = resolve(cwd, evidenceInput);
            if (existsSync(resolvedPath)) {
                raw = JSON.parse(readFileSync(resolvedPath, "utf8"));
            }
            else {
                raw = JSON.parse(evidenceInput);
            }
        }
        catch {
            return { valid: false, summary: "", error: "Invalid evidence JSON or file not found" };
        }
    }
    else {
        raw = evidenceInput;
    }
    const status = raw["status"];
    if (status !== "verified") {
        return {
            valid: false,
            summary: "",
            error: `Evidence status must be 'verified' (received '${status}'). Inferred or partial evidence cannot promote facts.`,
        };
    }
    const unknowns = Array.isArray(raw["unknowns"]) ? raw["unknowns"] : [];
    const inferences = Array.isArray(raw["inferences"]) ? raw["inferences"] : [];
    const unreadRanges = Array.isArray(raw["unreadRanges"]) ? raw["unreadRanges"] : [];
    if (unknowns.length > 0 || inferences.length > 0 || unreadRanges.length > 0) {
        return {
            valid: false,
            summary: "",
            error: `Verified evidence must have zero unknowns, inferences, or unreadRanges (found ${unknowns.length} unknowns, ${inferences.length} inferences, ${unreadRanges.length} unreadRanges).`,
        };
    }
    const summary = typeof raw["summary"] === "string" ? raw["summary"].trim() : "Verified active learning evidence";
    return { valid: true, summary };
}
export function evolveRules(cwd = process.cwd(), options = {}) {
    const events = readFailureEvents(cwd);
    const gotchas = extractFailurePatterns(events);
    const memoryFile = getMemoryPath(cwd);
    let existingContent = "";
    if (existsSync(memoryFile)) {
        try {
            existingContent = readFileSync(memoryFile, "utf8");
        }
        catch { }
    }
    const promoted = [];
    const shouldPromote = options.approve !== false;
    if (shouldPromote) {
        let evidenceSummary = "Verified telemetry cluster evolution";
        if (options.evidenceJson) {
            const validation = parseAndValidateEvidence(options.evidenceJson, cwd);
            if (!validation.valid) {
                throw new Error(`Active-learning memory promotion rejected: ${validation.error}`);
            }
            evidenceSummary = validation.summary;
        }
        for (const g of gotchas) {
            if (g.confidence >= 0.7 && !existingContent.includes(g.pattern)) {
                const factRecord = {
                    id: g.id,
                    timestamp: Date.now(),
                    category: "gotcha",
                    source: "active-learning",
                    evidenceStatus: "verified",
                    evidenceSummary,
                    content: `[자가학습 Gotcha] ${g.suggestedRule}`,
                };
                appendFileSync(memoryFile, `${JSON.stringify(factRecord)}\n`, "utf8");
                promoted.push(g);
            }
        }
    }
    return {
        analyzedEvents: events.length,
        identifiedPatterns: gotchas.length,
        promotedGotchas: promoted,
    };
}
