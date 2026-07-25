import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { appendLedgerEntry, loadLedger, stateDir } from "./audit-ledger.mjs";

const INTENT_FILE = "intent.json";
const GOALS_FILE = "goals.json";

const MODIFICATION_RE = /(고쳐줘|고쳐|고치|수정해줘|수정해|수정|바꿔줘|바꿔봐|바꿔|바꾸|만들어줘|만들|생성|추가해봐|추가해|추가|처리해줘|처리해|해줘|해주세요|fix|change|make|create|add|update|edit)/i;
const PATH_RE = /(?:[./\\\w-]+[/\\])?[\w.-]+\.(?:py|js|ts|tsx|jsx|md|json|toml|yml|yaml|html|css|scss|sql|ps1|sh|txt)/gi;
const PRONOUN_RE = /(이거|저거|그거|여기|이\s*부분|저번에\s*말한\s*거|[가-힣]+(?:는|던)\s*거)/i;
const DELEGATION_RE = /(알아서|적당히|어떻게\s*좀|느낌대로|니가\s*판단해서|네가\s*판단해서)/i;
const SKIP_PHRASE_RE = /(그냥\s*해|묻지\s*말고)/;
const QUICK_RE = /(왜|뭐|무엇|알려|설명|분석|조회|검색|찾아|확인만|가능한가|가능해|\?)/i;
const EDIT_ACTION_RE = /(고쳐|고치|수정|바꿔|바꾸|만들|생성|추가|처리|fix|change|make|create|add|update|edit)/i;

const CONCRETE_HINTS = new Set([
	"api", "ui", "로그인", "결제", "프로필", "관리자", "버튼", "색상", "라벨",
	"페이지", "화면", "메인화면", "텍스트", "파일", "함수", "기능", "테스트",
	"컴포넌트", "설정", "문서", "테이블", "컬럼", "마이그레이션", "서버",
	"포트", "번호", "라우팅", "로직", "쿼리", "성능", "coverage", "데이터베이스", "readme",
]);

const HYPOTHESIS_RE = /(?:가설|Hypothesis)\s*\d+\s*:/i;
const REJECTION_RE = /(?:기각|Rejected)\s*:/i;
const EVIDENCE_RE = /(?:증거|Evidence)\s*:/i;

const FAKE_EVIDENCE = ["assumed", "would pass", "should pass", "not run", "미실행"];

export function evaluateAmbiguity(prompt, workspaceRoot) {
	const requestedPaths = extractPaths(prompt);
	const signals = [];

	if (hasModification(prompt) && !requestedPaths.length && !hasConcreteObject(prompt)) {
		signals.push("missing_target");
	}
	if (PRONOUN_RE.test(prompt)) signals.push("pronoun_reference");
	if (DELEGATION_RE.test(prompt)) signals.push("delegation");
	if (isUltraShort(prompt)) signals.push("ultra_short");

	const score = signals.length;
	const neverFlag = shouldNeverFlag(workspaceRoot, prompt, requestedPaths);
	const ambiguous = score >= 2 && !neverFlag;

	return {
		ambiguous,
		ambiguity_score: score,
		signals,
		message: ambiguous
			? "의도 확인 필요: 모호성 신호 2개 이상"
			: neverFlag
				? "no-flag condition matched"
				: "의도 확인 불필요: 모호성 신호 2개 미만",
	};
}

export function checkInvestigationCompliance(text) {
	const hypothesisCount = (text.match(new RegExp(HYPOTHESIS_RE.source, "gi")) || []).length;
	const hasRejection = REJECTION_RE.test(text);
	const hasEvidence = EVIDENCE_RE.test(text);
	const missing = [];
	if (hypothesisCount < 3) missing.push("hypotheses");
	if (!hasRejection) missing.push("rejection");
	if (!hasEvidence) missing.push("evidence");
	return {
		compliant: missing.length === 0,
		hypothesis_count: hypothesisCount,
		has_rejection: hasRejection,
		has_evidence: hasEvidence,
		missing,
		message: missing.length === 0
			? "조사 팩 준수 / investigation pack compliant"
			: "조사 팩 마커가 부족합니다 / missing investigation markers",
	};
}

export function formatInvestigationDirective() {
	return `<investigation-discipline>
조사 시 다음 팩을 준수하세요 / During investigation, prepare the following pack:
1. 가설 1: ... / Hypothesis 1: ...
2. 가설 2: ... / Hypothesis 2: ...
3. 가설 3: ... / Hypothesis 3: ...
증거: ... / Evidence: ...
기각: ... / Rejected: ...
각 가설에 대해 증거를 수집하고, 기각된 가설을 명시하세요.
</investigation-discipline>`;
}

export function formatAmbiguityDirective(ambiguityResult) {
	return `<intent-clarification>
의도 확인이 필요합니다. 다음을 명확히 하세요:
- 목표 (goal): 무엇을 달성하려는가?
- 범위 (scope): 어떤 파일/모듈이 관련되는가?
- 비목표 (non-goals): 무엇을 하지 않을 것인가?
모호성 신호: ${ambiguityResult.signals.join(", ")}
점수: ${ambiguityResult.ambiguity_score}
</intent-clarification>`;
}

export function hasIntent(workspaceRoot) {
	return existsSync(join(stateDir(workspaceRoot), INTENT_FILE));
}

export function loadIntent(workspaceRoot) {
	const path = join(stateDir(workspaceRoot), INTENT_FILE);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

export function saveIntent(workspaceRoot, intent) {
	const dir = stateDir(workspaceRoot);
	const path = join(dir, INTENT_FILE);
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(intent, null, 2) + "\n", "utf8");
	renameSync(tmp, path);
}

export function hasGoals(workspaceRoot) {
	return existsSync(join(stateDir(workspaceRoot), GOALS_FILE));
}

export function loadGoals(workspaceRoot) {
	const path = join(stateDir(workspaceRoot), GOALS_FILE);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

export function saveGoals(workspaceRoot, goals) {
	const dir = stateDir(workspaceRoot);
	const path = join(dir, GOALS_FILE);
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(goals, null, 2) + "\n", "utf8");
	renameSync(tmp, path);
}

export function evaluateR1Contract(workspaceRoot, payload) {
	if (!isHighRisk(payload)) return { decision: "allow", message: "not high-risk" };
	const contract = loadContract(workspaceRoot);
	if (contract && isValidContract(contract)) {
		return { decision: "allow", message: "valid high-risk contract found" };
	}
	return {
		decision: "block",
		reason: `[smtw] R1: high-risk 수정은 contract.json 계약이 먼저 필요합니다. ` +
			`restated_goal, acceptance, evidence를 기록한 뒤 다시 시도하세요. ` +
			`/ High-risk edits require a valid task contract first.`,
	};
}

export function loadContract(workspaceRoot) {
	const path = join(stateDir(workspaceRoot), "contract.json");
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

export function saveContract(workspaceRoot, contract) {
	const dir = stateDir(workspaceRoot);
	const path = join(dir, "contract.json");
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(contract, null, 2) + "\n", "utf8");
	renameSync(tmp, path);
}

function isValidContract(contract) {
	if (!contract || typeof contract !== "object") return false;
	if (typeof contract.restated_goal !== "string" || !contract.restated_goal.trim()) return false;
	if (!Array.isArray(contract.acceptance) || !contract.acceptance.some((s) => s.trim())) return false;
	if (!Array.isArray(contract.evidence) || !contract.evidence.some((s) => s.trim())) return false;
	const text = contract.evidence.join("\n").toLowerCase();
	return !FAKE_EVIDENCE.some((marker) => text.includes(marker));
}

function isHighRisk(payload) {
	const prompt = payload.prompt || "";
	const paths = payload.file_paths || [];
	const command = payload.command || "";
	const haystack = [prompt, ...paths, command].join(" ");
	return /(rm\s+-rf|git\s+(reset|clean|stash|checkout\s+--)|force\s+push|DROP\s+TABLE|DELETE\s+FROM|truncate|format\s+[A-Z]:|mkfs)/i.test(haystack);
}

function hasModification(prompt) {
	return MODIFICATION_RE.test(prompt);
}

function extractPaths(prompt) {
	return [...prompt.matchAll(PATH_RE)].map((m) => m[0]);
}

function hasConcreteObject(prompt) {
	const lowered = prompt.toLowerCase();
	for (const hint of CONCRETE_HINTS) {
		if (lowered.includes(hint)) return true;
	}
	return false;
}

function isUltraShort(prompt) {
	const compact = prompt.replace(/\s+/g, "");
	return compact.length < 15 && hasModification(prompt);
}

function shouldNeverFlag(workspaceRoot, prompt, requestedPaths) {
	if (!prompt.trim()) return true;
	if (SKIP_PHRASE_RE.test(prompt)) return true;
	if (requestedPaths.length > 0) return true;
	if (hasGoals(workspaceRoot)) return true;
	if (hasIntent(workspaceRoot)) return true;
	return isQuickMode(prompt);
}

function isQuickMode(prompt) {
	if (QUICK_RE.test(prompt) && !EDIT_ACTION_RE.test(prompt)) return true;
	if (!hasModification(prompt)) return true;
	return false;
}
