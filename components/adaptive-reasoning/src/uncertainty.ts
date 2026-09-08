/**
 * Med-Gemini inspired Uncertainty-Guided Search Trigger (Section 4.3 / Feature 08)
 * Evaluates epistemic uncertainty and multi-path reasoning entropy to trigger
 * external grounding when confidence is low or hypotheses diverge.
 */

import {
	EntropyEvaluation,
	evaluateHypothesisEntropy,
	POSITIVE_VERDICTS,
	NEGATIVE_VERDICTS
} from "./entropy.js";

export {
	EntropyEvaluation,
	evaluateHypothesisEntropy,
	POSITIVE_VERDICTS,
	NEGATIVE_VERDICTS
};

export interface UncertaintyEvaluation {
	score: number; // 0.0 ~ 1.0
	level: "low" | "medium" | "high";
	triggerSearch: boolean;
	reasons: string[];
	entropyEvaluation?: EntropyEvaluation;
}

const HIGH_UNCERTAINTY_PATTERNS: Array<[RegExp, string, number]> = [
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

export function computeUncertainty(prompt: string): UncertaintyEvaluation {
	const trimmed = prompt.trim();
	if (!trimmed) {
		return { score: 0.0, level: "low", triggerSearch: false, reasons: ["Empty input"] };
	}

	let totalScore = 0.1; // Baseline uncertainty
	const reasons: string[] = [];

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
export function computeMultiPathUncertainty(
	prompt: string,
	reasoningPaths?: string[]
): UncertaintyEvaluation {
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

export function formatUncertaintyDirective(evaluation: UncertaintyEvaluation): string {
	if (!evaluation.triggerSearch) return "";

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

/**
 * Enterprise Factuality Generation Configuration (Section 4.1 & 8)
 * Enforces zero-temperature deterministic inference and tight dynamic search threshold.
 */
export const FACTUALITY_GENERATION_CONFIG = {
	temperature: 0.0,
	topP: 0.95,
	topK: 40,
	dynamicSearchThreshold: 0.3,
};

export interface HighFidelityEvaluation {
	grounded: boolean;
	overlapRatio: number;
	missingEntities: string[];
	verdict: "PASS" | "FAIL";
}

/**
 * Local High-Fidelity non-parametric grounding verifier (Section 4.2).
 * Token-overlap gate only. No Vertex API call.
 */
export function evaluateHighFidelityGrounding(
	sourceDocument: string,
	modelResponse: string,
	minOverlapThreshold: number = 0.70
): HighFidelityEvaluation {
	if (!modelResponse || modelResponse.trim().length === 0) {
		return { grounded: false, overlapRatio: 0, missingEntities: [], verdict: "FAIL" };
	}
	const cleanSrc = sourceDocument.toLowerCase();
	const cleanResp = modelResponse.toLowerCase();

	const tokens = cleanResp
		.replace(/[<>[\](),.:;'"!?]/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 1);

	if (tokens.length === 0) {
		return { grounded: true, overlapRatio: 1.0, missingEntities: [], verdict: "PASS" };
	}

	const missing = [];
	let groundedCount = 0;
	for (const token of tokens) {
		if (cleanSrc.includes(token)) {
			groundedCount++;
		} else {
			missing.push(token);
		}
	}

	const overlapRatio = Number((groundedCount / tokens.length).toFixed(3));
	const grounded = overlapRatio >= minOverlapThreshold;
	return {
		grounded,
		overlapRatio,
		missingEntities: Array.from(new Set(missing)).slice(0, 10),
		verdict: grounded ? "PASS" : "FAIL",
	};
}
