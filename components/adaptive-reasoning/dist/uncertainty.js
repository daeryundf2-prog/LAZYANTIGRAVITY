/**
 * Med-Gemini inspired Uncertainty-Guided Search Trigger (Feature 08)
 * Evaluates epistemic uncertainty and triggers external grounding when confidence is low.
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
export function computeUncertainty(prompt) {
    const trimmed = prompt.trim();
    if (!trimmed) {
        return { score: 0.0, level: "low", triggerSearch: false, reasons: ["Empty input"] };
    }
    let totalScore = 0.1; // Baseline baseline uncertainty
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
export function formatUncertaintyDirective(evaluation) {
    if (!evaluation.triggerSearch)
        return "";
    return `<uncertainty-guided-search>
# Uncertainty-Guided Search Trigger (Med-Gemini Protocol)
- Epistemic Uncertainty Score: ${evaluation.score} (${evaluation.level.toUpperCase()})
- Trigger Reason: ${evaluation.reasons.join("; ")}
- Overconfidence Ban: Active. Do not speculate or rely on internal parametric memory under high uncertainty.
- Action: Invoke web_search, fetch_json, or file lookup before stating specific versions, numbers, or API contracts.
- Fallback: If primary evidence cannot be found, output [INSUFFICIENT_DATA: <missing detail>] rather than guessing.
</uncertainty-guided-search>`;
}
