import test from "node:test";
import assert from "node:assert/strict";
import { computeThinkingBudget, formatThinkingBudgetDirective } from "../dist/budget-scaler.js";
import { skeletonizeCode } from "../dist/skeletonizer.js";

test("computeThinkingBudget routes deep security tasks to 64k tokens and pro model", () => {
	const res = computeThinkingBudget("Check for SQL injection vulnerability and audit security");
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
	const res = computeThinkingBudget("git status");
	assert.equal(res.budget, 0);
	assert.equal(res.level, "off");
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
