import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DISPATCHER = join(ROOT, "scripts", "user-prompt-dispatcher.mjs");

function runDispatcher(payload) {
	const res = spawnSync(process.execPath, [DISPATCHER], {
		input: JSON.stringify({ transcript_path: null, ...payload }),
		encoding: "utf8",
		timeout: 20000,
		cwd: ROOT,
		env: { ...process.env, PLUGIN_ROOT: ROOT },
	});
	assert.equal(res.status, 0, res.stderr);
	return JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
}

test("dispatcher runs every UserPromptSubmit handler in one process", () => {
	const ctx = runDispatcher({
		hook_event_name: "UserPromptSubmit",
		session_id: "acc-test",
		prompt: "ulw 결제 모듈 리팩토링을 진행해줘",
	});
	assert.ok(ctx.includes("ULTRAWORK"), "ultrawork directive must be present");
	assert.ok(ctx.length > 1000, "rules/ulw-loop contributions expected for a heavy prompt");
});

test("dispatcher injects quick-lane directive for light queries", () => {
	const ctx = runDispatcher({
		hook_event_name: "UserPromptSubmit",
		session_id: "acc-test",
		prompt: "이 함수 어디에 정의되어 있어?",
	});
	assert.ok(ctx.length > 0, "quick-lane directive expected");
});

test("dispatcher is resilient to a malformed handler input shape", () => {
	const res = spawnSync(process.execPath, [DISPATCHER], {
		input: "not-json",
		encoding: "utf8",
		timeout: 20000,
		cwd: ROOT,
		env: { ...process.env, PLUGIN_ROOT: ROOT },
	});
	assert.equal(res.status, 0, "malformed stdin must not crash the dispatcher");
	const output = JSON.parse(res.stdout);
	assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
});

test("dispatcher injects dynamic search grounding directive for factual/version queries (Feature 03)", () => {
	const ctx = runDispatcher({
		hook_event_name: "UserPromptSubmit",
		session_id: "acc-test",
		prompt: "React 19 버전의 최신 릴리즈 스펙과 공식문서 변경점을 확인해줘",
	});
	assert.ok(ctx.includes("dynamic-search-grounding"), "dynamic search grounding directive expected");
	assert.ok(ctx.includes("Adaptive Threshold = 0.3"), "threshold 0.3 expected");
});

test("dispatcher injects sandwich prompting & chunk tagging directive for long prompts (Feature 12)", () => {
	const longText = "DOC SECTION 1:\n" + "x".repeat(700) + "\nDOC SECTION 2:\n" + "y".repeat(700);
	const ctx = runDispatcher({
		hook_event_name: "UserPromptSubmit",
		session_id: "acc-test",
		prompt: longText,
	});
	assert.ok(ctx.includes("sandwich-prompt-guard"), "sandwich prompt guard expected");
	assert.ok(ctx.includes("[DOC_ID:"), "DOC_ID guidance expected");
});

test("dispatcher injects high-fidelity grounding directive when triggered (Section 4.2)", () => {
	const ctx = runDispatcher({
		hook_event_name: "UserPromptSubmit",
		session_id: "acc-test",
		prompt: "보고서 사실관계를 --high-fidelity 엄격한 그라운딩 모드로 비파라메트릭 검증해줘",
	});
	assert.ok(ctx.includes("high-fidelity-grounding"), "high-fidelity grounding directive expected");
	assert.ok(ctx.includes("Strict Non-Parametric"), "strict non-parametric guidance expected");
});

