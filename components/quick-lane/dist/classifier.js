const HEAVY_ORCHESTRATION_PATTERNS = [
    /\b(?:ultrawork|ulw|ulw-loop|ulw-plan)\b/i,
    /\b(?:start-work|start work|execute plan)\b/i,
    /\b(?:review-work|dual-verify|hypothesis-tree|swarm-sync|arch-guard)\b/i,
    /\b(?:전체 리팩토링|아키텍처 변경|대규모|마이그레이션)\b/i,
];
const QUICK_LANE_PATTERNS = [
    /^(?:explain|where is|find|lookup|show|what is|how to|why)\b/i,
    /^(?:설명|어디|찾아|보여|어떻게|왜)\b/i,
    /(?:오타|단순 수정|테이블 포맷|quick check|단순 확인|상태 확인)/i,
    /^(?:git status|git diff|git log|npm test|ls|pwd)$/i,
];
export function isQuickLanePrompt(prompt) {
    const trimmed = prompt.trim();
    if (trimmed.length === 0)
        return false;
    // If it explicitly asks for heavy orchestration or planning, do not use quick-lane
    if (HEAVY_ORCHESTRATION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        return false;
    }
    // If it matches quick-lane indicators or is very short single-intent query (< 60 chars and not a command)
    if (QUICK_LANE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        return true;
    }
    // Short direct question heuristics
    if (trimmed.length < 80 && (trimmed.endsWith("?") || trimmed.endsWith("줘") || trimmed.endsWith("해봐") || trimmed.endsWith("나열해라"))) {
        return true;
    }
    return false;
}
