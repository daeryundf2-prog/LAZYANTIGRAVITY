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
