/**
 * Med-Gemini inspired Uncertainty-Guided Search Trigger (Section 4.3 / Feature 08)
 * Evaluates epistemic uncertainty and multi-path reasoning entropy to trigger
 * external grounding when confidence is low or hypotheses diverge.
 */
const HIGH_UNCERTAINTY_PATTERNS = [
    [
        /최신\s*(버전|스펙|릴리즈|api|라이브러리)|latest\s*(version|release|spec|api)/i,
        "Time-sensitive release or API specification query",
        0.4
    ],
    [
        /법령|판례|조문|위헌|위법성|형량|statute|precedent|jurisdiction/i,
        "High-risk legal or statute inquiry requiring primary legal grounding",
        0.5
    ],
    [
        /cve-\d{4}-\d+|vulnerability|취약점|exploit|제로데이/i,
        "Security vulnerability or CVE inquiry requiring CVE database lookup",
        0.5
    ],
    [
        /수치|벤치마크|f1\s*score|tps|latency|benchmark|정확도\s*비율/i,
        "Specific numerical benchmark or performance metric inquiry",
        0.3
    ],
    [
        /확실하지\s*않|모르겠|추측|불확실|충돌|unclear|unsure|uncertain|conflicting/i,
        "Explicit expression of uncertainty or conflicting hypotheses",
        0.4
    ]
];
const POSITIVE_VERDICTS = /\b(가능|성립|일치|존재|합치|정상|통과|유효|인정|true|pass|valid|supported|yes)\b/i;
const NEGATIVE_VERDICTS = /\b(불가|불성립|불일치|부존재|위반|오류|실패|무효|부인|기각|false|fail|invalid|refuted|no)\b/i;
/**
 * Evaluates Shannon entropy across multiple reasoning paths / hypotheses (Section 4.3).
 * When reasoning paths diverge or produce contradictory verdicts, entropy rises and triggers search.
 */
export function evaluateHypothesisEntropy(hypotheses) {
    const validPaths = hypotheses.map((h) => h.trim()).filter((h) => h.length > 0);
    if (validPaths.length < 2) {
        return {
            entropy: 0.0,
            pathCount: validPaths.length,
            conflicting: false,
            agreementRatio: 1.0,
            triggerSearch: false,
            reasons: ["Insufficient paths for multi-path comparison"]
        };
    }
    // 1. Check for polarity conflict (Affirmative vs Negative)
    let posCount = 0;
    let negCount = 0;
    for (const p of validPaths) {
        if (POSITIVE_VERDICTS.test(p))
            posCount++;
        if (NEGATIVE_VERDICTS.test(p))
            negCount++;
    }
    const hasDirectPolarityConflict = posCount > 0 && negCount > 0;
    // 2. Cluster conclusions by normalized text signature
    const clusterCounts = new Map();
    for (const path of validPaths) {
        let key = path.toLowerCase().replace(/\s+/g, " ");
        // Normalize key numbers and verdicts
        const numbers = (path.match(/\b\d+(?:\.\d+)?\b/g) || []).join(",");
        const hasPos = POSITIVE_VERDICTS.test(path);
        const hasNeg = NEGATIVE_VERDICTS.test(path);
        const verdictTag = hasPos && !hasNeg ? "POS" : hasNeg && !hasPos ? "NEG" : "NEUTRAL";
        const clusterKey = `${verdictTag}#nums:${numbers}#len:${Math.round(path.length / 30)}`;
        clusterCounts.set(clusterKey, (clusterCounts.get(clusterKey) || 0) + 1);
    }
    // 3. Compute Shannon entropy: H = - sum(p * log2(p))
    const total = validPaths.length;
    let shannon = 0;
    let maxCount = 0;
    for (const count of clusterCounts.values()) {
        if (count > maxCount)
            maxCount = count;
        const p = count / total;
        shannon -= p * Math.log2(p);
    }
    const maxPossibleEntropy = Math.log2(Math.max(clusterCounts.size, 2));
    let normalizedEntropy = maxPossibleEntropy > 0 ? shannon / maxPossibleEntropy : 0;
    normalizedEntropy = Math.min(1.0, Math.max(0.0, Number(normalizedEntropy.toFixed(2))));
    const agreementRatio = Number((maxCount / total).toFixed(2));
    const conflicting = hasDirectPolarityConflict || normalizedEntropy >= 0.5 || agreementRatio < 0.6;
    const triggerSearch = conflicting || normalizedEntropy >= 0.4;
    const reasons = [];
    if (hasDirectPolarityConflict) {
        reasons.push(`Direct polarity contradiction across reasoning paths (Positive: ${posCount}, Negative: ${negCount})`);
    }
    if (normalizedEntropy >= 0.4) {
        reasons.push(`High hypothesis entropy (${normalizedEntropy}) exceeds Med-Gemini threshold 0.40`);
    }
    if (agreementRatio < 0.6) {
        reasons.push(`Low path agreement ratio (${(agreementRatio * 100).toFixed(0)}% < 60%)`);
    }
    if (reasons.length === 0) {
        reasons.push("Reasoning paths converged with high consensus");
    }
    return {
        entropy: normalizedEntropy,
        pathCount: total,
        conflicting,
        agreementRatio,
        triggerSearch,
        reasons
    };
}
export function computeUncertainty(prompt) {
    const trimmed = prompt.trim();
    if (!trimmed) {
        return { score: 0.0, level: "low", triggerSearch: false, reasons: ["Empty input"] };
    }
    let totalScore = 0.1; // Baseline uncertainty
    const reasons = [];
    for (const [regex, reason, weight] of HIGH_UNCERTAINTY_PATTERNS) {
        if (regex.test(trimmed)) {
            totalScore += weight;
            reasons.push(reason);
        }
    }
    const normalizedScore = Math.min(1.0, Number(totalScore.toFixed(2)));
    const level = normalizedScore >= 0.6 ? "high" : normalizedScore >= 0.35 ? "medium" : "low";
    const triggerSearch = normalizedScore >= 0.5;
    return {
        score: normalizedScore,
        level,
        triggerSearch,
        reasons: reasons.length > 0 ? reasons : ["Normal operational confidence"]
    };
}
/**
 * Blends prompt epistemic uncertainty with multi-path reasoning entropy (Section 4.3).
 */
export function computeMultiPathUncertainty(prompt, reasoningPaths) {
    const baseEval = computeUncertainty(prompt);
    if (!reasoningPaths || reasoningPaths.length < 2) {
        return baseEval;
    }
    const entropyEval = evaluateHypothesisEntropy(reasoningPaths);
    const blendedScore = Math.min(1.0, Number(Math.max(baseEval.score, entropyEval.entropy).toFixed(2)));
    const level = blendedScore >= 0.6 ? "high" : blendedScore >= 0.35 ? "medium" : "low";
    const triggerSearch = baseEval.triggerSearch || entropyEval.triggerSearch;
    const allReasons = [...baseEval.reasons];
    if (entropyEval.triggerSearch) {
        allReasons.push(...entropyEval.reasons);
    }
    return {
        score: blendedScore,
        level,
        triggerSearch,
        reasons: allReasons,
        entropyEvaluation: entropyEval
    };
}
export function formatUncertaintyDirective(evaluation) {
    if (!evaluation.triggerSearch)
        return "";
    const entropyLine = evaluation.entropyEvaluation
        ? `\n- Multi-Path Entropy: ${evaluation.entropyEvaluation.entropy} (Paths: ${evaluation.entropyEvaluation.pathCount}, Agreement: ${(evaluation.entropyEvaluation.agreementRatio * 100).toFixed(0)}%, Conflicting: ${evaluation.entropyEvaluation.conflicting})`
        : "";
    return `<uncertainty-guided-search>
# Uncertainty-Guided Search Trigger (Med-Gemini Protocol Section 4.3)
- Epistemic Uncertainty Score: ${evaluation.score} (${evaluation.level.toUpperCase()})${entropyLine}
- Trigger Reason: ${evaluation.reasons.join("; ")}
- Overconfidence Ban: Active. Do not speculate or rely on internal parametric memory under high uncertainty.
- Action: Invoke web_search, fetch_json, or primary legal/forensic artifact lookup before stating specific versions, numbers, or verdicts.
- Fallback: If primary evidence cannot be found, output [INSUFFICIENT_DATA: <missing detail>] rather than guessing.
</uncertainty-guided-search>`;
}
