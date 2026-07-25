const READ_INTENT_RE = /(?:보여|봐|확인|조회|검색|찾아|분석|설명|알려|뭐|무엇|왜|어떻|어디|누구|언제|가능|show|view|list|find|search|read|check|inspect|explain|describe|what|why|how|where|when|who|help|understand|analyze)/i;
const WRITE_INTENT_RE = /(?:고쳐|수정|바꿔|만들|추가|삭제|생성|처리|구현|리팩토|이동|이름\s*변경|fix|change|make|create|add|delete|remove|update|edit|implement|refactor|move|rename|write|overwrite|replace)/i;
const QUESTION_MARKS_RE = /[?？]/;
const IMPERATIVE_SUFFIX_RE = /(?:해줘|해주세요|해라|줘|고쳐|바꿔|만들어|추가해|처리해|please|fix|make|add|update|edit)\s*[.!]*$/i;
const READ_ONLY_TOOLS = new Set(["view_file", "list_dir", "find_by_name", "grep_search", "read_url_content", "search_web"]);

export function classifyIntent(prompt, toolName, toolArgs) {
	if (toolName && READ_ONLY_TOOLS.has(toolName)) {
		return { intent: "read", confidence: "high", reason: "read-only tool" };
	}

	if (!prompt || typeof prompt !== "string") {
		return { intent: "unknown", confidence: "low", reason: "no prompt" };
	}

	const trimmed = prompt.trim();
	if (!trimmed) {
		return { intent: "unknown", confidence: "low", reason: "empty prompt" };
	}

	const hasReadSignal = READ_INTENT_RE.test(trimmed);
	const hasWriteSignal = WRITE_INTENT_RE.test(trimmed);
	const hasQuestionMark = QUESTION_MARKS_RE.test(trimmed);
	const hasImperative = IMPERATIVE_SUFFIX_RE.test(trimmed);

	if (toolName === "write_to_file" || toolName === "replace_file_content" || toolName === "multi_replace_file_content") {
		const isQuestion = (hasReadSignal && !hasWriteSignal) || (hasQuestionMark && !hasWriteSignal);
		if (isQuestion) {
			return {
				intent: "question_masked_as_write",
				confidence: "high",
				reason: "질문 의도가 감지되었으나 쓰기 도구 호출 — 차단. " +
					"질문은 읽기 도구(view_file/grep_search)로 답변해야 합니다. / " +
					"Question intent detected but write tool called — blocked. " +
					"Questions should be answered with read tools.",
				shouldBlock: true,
			};
		}
		return { intent: "write", confidence: "high", reason: "write tool with write intent" };
	}

	if (toolName === "run_command") {
		const cmd = (toolArgs?.CommandLine || "").toLowerCase();
		const readOnlyCmd = /^(?:cat|head|tail|less|more|ls|find|grep|rg|fd|file|stat|du|df|ps|top|echo|pwd|whoami|date|wc|diff|git\s+(status|log|diff|show|branch)|npm\s+(list|ls|outdated|run\s+lint)|ruff\s+check|eslint|tsc|pyright)\b/;
		if (readOnlyCmd.test(cmd)) {
			return { intent: "read", confidence: "high", reason: "read-only command" };
		}
	}

	if (hasReadSignal && !hasWriteSignal) {
		return { intent: "read", confidence: "medium", reason: "read signal without write signal" };
	}

	if (hasQuestionMark && !hasImperative && !hasWriteSignal) {
		return { intent: "question", confidence: "medium", reason: "question mark without imperative" };
	}

	if (hasWriteSignal || hasImperative) {
		return { intent: "write", confidence: "medium", reason: "write signal or imperative suffix" };
	}

	return { intent: "unknown", confidence: "low", reason: "no clear signal" };
}

export function shouldBlockWriteForIntent(intentResult, toolName) {
	if (intentResult.shouldBlock) return true;
	if (intentResult.intent === "question" || intentResult.intent === "read") {
		if (toolName === "write_to_file" || toolName === "replace_file_content" || toolName === "multi_replace_file_content") {
			return true;
		}
	}
	return false;
}
