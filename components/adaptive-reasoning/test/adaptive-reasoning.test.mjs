import assert from "node:assert/strict";
import test from "node:test";
import { computeThinkingBudget } from "../dist/budget-scaler.js";
import { skeletonizeCode } from "../dist/skeletonizer.js";

test("computeThinkingBudget routes deep security tasks to 64k tokens and pro model", () => {
	const res = computeThinkingBudget(
		"Check for SQL injection vulnerability and audit security",
	);
	assert.equal(res.budget, 64000);
	assert.equal(res.tier, "pro");
	assert.equal(res.level, "deep");
});

test("computeThinkingBudget routes refactoring and orchestration tasks to 32k tokens", () => {
	const res = computeThinkingBudget("ultrawork full architecture refactor");
	assert.equal(res.budget, 32768);
	assert.equal(res.tier, "flash");
	assert.equal(res.level, "high");
});

test("computeThinkingBudget turns off budget for simple fast queries", () => {
	assert.equal(computeThinkingBudget("git status").budget, 0);
	assert.equal(computeThinkingBudget("ls -la").budget, 0);
	assert.equal(computeThinkingBudget("pwd").budget, 0);
	assert.equal(computeThinkingBudget("whoami").budget, 0);
	assert.equal(computeThinkingBudget("clear").budget, 0);
});

test("computeThinkingBudget routes short location questions and github to off budget", () => {
	assert.equal(
		computeThinkingBudget("이 함수 어디에 정의되어 있어?").budget,
		0,
	);
	assert.equal(computeThinkingBudget("github status").budget, 0);
	assert.equal(computeThinkingBudget("설명해줘").budget, 0);
	assert.equal(computeThinkingBudget("로그 확인해줘").budget, 0);
	assert.equal(computeThinkingBudget("where is config.json").budget, 0);
});

test("computeThinkingBudget routes general non-inquiry non-modification statements to standard", () => {
	const res = computeThinkingBudget("some general application data processing payload for session");
	assert.equal(res.budget, 8192);
	assert.equal(res.tier, "flash");
	assert.equal(res.level, "standard");
});

test("computeThinkingBudget does not misclassify short action/modification requests as off budget", () => {
	// Should route to standard (8192 tokens / flash) instead of quick-lane (0 tokens / flash_lite)
	const res1 = computeThinkingBudget("JWT 인증 구현해줘");
	assert.equal(res1.budget, 8192);
	assert.equal(res1.tier, "flash");
	assert.equal(res1.level, "standard");

	const res2 = computeThinkingBudget("auth.ts 버그 고쳐줘");
	assert.equal(res2.budget, 8192);
	assert.equal(res2.tier, "flash");
	assert.equal(res2.level, "standard");

	const res3 = computeThinkingBudget("단위 테스트 작성해봐");
	assert.equal(res3.budget, 8192);
	assert.equal(res3.tier, "flash");
	assert.equal(res3.level, "standard");
});

test("skeletonizeCode compresses TypeScript code by stripping function bodies", () => {
	const tsCode = `
import { readFile } from "node:fs/promises";

export interface UserProfile {
    id: string;
    name: string;
}

export async function fetchUserData(userId: string): Promise<UserProfile> {
    const raw = await readFile("./data.json", "utf8");
    const parsed = JSON.parse(raw);
    return { id: userId, name: parsed.name };
}
`;
	const result = skeletonizeCode(tsCode, "test.ts");
	assert.ok(result.skeleton.includes("export interface UserProfile"));
	assert.ok(result.skeleton.includes("export async function fetchUserData"));
	assert.ok(!result.skeleton.includes("const raw = await readFile"));
	assert.ok(result.skeletonLength < result.originalLength);
});

test("skeletonizeCode preserves interface members and drops nested body blocks", () => {
	const tsCode = `
interface UserProfile {
    id: string;
    name: string;
}

export async function fetchUserData(userId: string) {
    const raw = await readFile("./data.json", "utf8");
    if (raw.length === 0) {
        throw new Error("empty");
    }
    for (let i = 0; i < raw.length; i++) {
        console.log(i);
    }
    return { id: userId, name: raw };
}
`;
	const result = skeletonizeCode(tsCode, "test.ts");
	assert.ok(result.skeleton.includes("id: string;"));
	assert.ok(result.skeleton.includes("name: string;"));
	assert.ok(!result.skeleton.includes("const raw = await readFile"));
	assert.ok(!result.skeleton.includes("if (raw.length"));
	assert.ok(!result.skeleton.includes("for (let"));
	assert.ok(!result.skeleton.includes("console.log(i)"));
});

test("skeletonizeCode preserves class members and getters while stripping method bodies", () => {
	const tsCode = `
export class UserService {
    private users: Map<string, string>;

    constructor(private db: Database) {
        this.db.connect();
    }

    async find(id: string): Promise<User> {
        const raw = await this.db.query(id);
        return this.parse(raw);
    }

    get count(): number {
        return this.users.size;
    }
}
`;
	const result = skeletonizeCode(tsCode, "test.ts");
	assert.ok(result.skeleton.includes("export class UserService"));
	assert.ok(result.skeleton.includes("private users: Map"));
	assert.ok(result.skeleton.includes("constructor(private db"));
	assert.ok(result.skeleton.includes("async find(id: string)"));
	assert.ok(result.skeleton.includes("get count(): number"));
	assert.ok(!result.skeleton.includes("this.db.connect"));
	assert.ok(!result.skeleton.includes("const raw = await this.db.query"));
	assert.ok(!result.skeleton.includes("return this.users.size"));
});

test("skeletonizeCode strips single-line function bodies", () => {
	const result = skeletonizeCode("function foo() { return 1; }\nconst x = 2;", "test.ts");
	assert.ok(result.skeleton.includes("function foo() /* ... */"));
	assert.ok(!result.skeleton.includes("return 1"));
});

test("formatThinkingBudgetDirective includes 2-Phase Cognitive Decoupling (Feature 11)", async () => {
	const { formatThinkingBudgetDirective } = await import("../dist/budget-scaler.js");
	const directive = formatThinkingBudgetDirective({
		budget: 32768,
		tier: "flash",
		level: "high",
		rationale: "Complex task"
	});
	assert.ok(directive.includes("2-Phase Cognitive Decoupling"));
	assert.ok(directive.includes("Phase 1 (Thinking Trace)"));
	assert.ok(directive.includes("Phase 2 (Response Formulation)"));
});

test("computeUncertainty triggers external grounding for high uncertainty prompts (Feature 08)", async () => {
	const { computeUncertainty, formatUncertaintyDirective } = await import("../dist/uncertainty.js");
	const res = computeUncertainty("개인정보보호법 제29조와 최신 릴리즈 API 취약점 CVE-2024-1234 조사해줘");
	assert.equal(res.triggerSearch, true);
	assert.equal(res.level, "high");
	assert.ok(res.score >= 0.6);

	const directive = formatUncertaintyDirective(res);
	assert.ok(directive.includes("Uncertainty-Guided Search Trigger"));
	assert.match(directive, /Overconfidence ban/i);
});

test("evaluateHypothesisEntropy measures consensus vs divergence across reasoning paths (Section 4.3)", async () => {
	const { evaluateHypothesisEntropy } = await import("../dist/uncertainty.js");

	// High consensus paths (agreeing)
	const agreeingPaths = [
		"결론: 해당 조항은 유효하며 성립한다 (true).",
		"분석: 조항 요건이 일치하여 유효하다 (true).",
		"검토: 법리상 유효하며 성립하는 것으로 판단된다 (true).",
	];
	const agreeRes = evaluateHypothesisEntropy(agreeingPaths);
	assert.equal(agreeRes.conflicting, false);
	assert.equal(agreeRes.triggerSearch, false);
	assert.ok(agreeRes.entropy <= 0.2);
	assert.equal(agreeRes.agreementRatio, 1.0);

	// Conflicting paths (divergent polarity)
	const conflictingPaths = [
		"가설 1: 보안 취약점이 존재하며 공격 성립이 가능하다 (valid).",
		"가설 2: 패치가 적용되어 취약점이 부존재하며 공격이 불가하다 (invalid, refuted).",
	];
	const conflictRes = evaluateHypothesisEntropy(conflictingPaths);
	assert.equal(conflictRes.conflicting, true);
	assert.equal(conflictRes.triggerSearch, true);
	assert.ok(conflictRes.reasons.some((r) => r.includes("polarity contradiction") || r.includes("entropy")));
});

test("computeMultiPathUncertainty elevates uncertainty when paths diverge (Section 4.3)", async () => {
	const { computeMultiPathUncertainty, formatUncertaintyDirective } = await import("../dist/uncertainty.js");

	const paths = [
		"경로 A: 피고의 고의가 인정됨 (true)",
		"경로 B: 피고의 과실만 인정되며 고의는 기각됨 (false, refuted)",
	];
	const res = computeMultiPathUncertainty("피고의 책임 유무 검토", paths);
	assert.equal(res.triggerSearch, true);
	assert.ok(res.entropyEvaluation);
	assert.equal(res.entropyEvaluation.conflicting, true);

	const directive = formatUncertaintyDirective(res);
	assert.ok(directive.includes("Multi-Path Entropy"));
	assert.ok(directive.includes("Section 4.3"));
});

test("evaluateHypothesisEntropy triggers on substantive semantic divergence with same polarity (Section 4.3)", async () => {
	const { evaluateHypothesisEntropy } = await import("../dist/uncertainty.js");

	const divergentHypotheses = [
		"원인은 메모리 누수 100건으로 확인되었습니다 pass",
		"원인은 데이터베이스 교착상태 100건으로 확인되었습니다 pass",
	];
	const res = evaluateHypothesisEntropy(divergentHypotheses);
	assert.ok(res.entropy >= 0.5, `Entropy should be >= 0.5, got ${res.entropy}`);
	assert.equal(res.triggerSearch, true);
	assert.equal(res.conflicting, true);
});

