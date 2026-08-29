import test from "node:test";
import assert from "node:assert/strict";
import { isQuickLanePrompt } from "../dist/classifier.js";
import { runQuickLaneHook } from "../dist/codex-hook.js";

test("isQuickLanePrompt identifies simple direct queries", () => {
	assert.equal(isQuickLanePrompt("이 함수 어디에 정의되어 있어?"), true);
	assert.equal(isQuickLanePrompt("git status"), true);
	assert.equal(isQuickLanePrompt("오타 하나 수정해줘"), true);
	assert.equal(isQuickLanePrompt("explain how this component works"), true);
});

test("isQuickLanePrompt skips heavy orchestration prompts", () => {
	assert.equal(isQuickLanePrompt("ultrawork 전체 리팩토링 진행해"), false);
	assert.equal(isQuickLanePrompt("/ulw implement auth system"), false);
	assert.equal(isQuickLanePrompt("ulw-plan 아키텍처 재설계"), false);
	assert.equal(isQuickLanePrompt("review-work"), false);
});

test("isQuickLanePrompt handles command forms and mixed-language queries", () => {
	assert.equal(isQuickLanePrompt("What is a closure?"), true);
	assert.equal(isQuickLanePrompt("show me the failing tests"), true);
	assert.equal(isQuickLanePrompt("git log --oneline -5"), true);
	assert.equal(isQuickLanePrompt("빠른 상태 확인 부탁해"), true);
	assert.equal(isQuickLanePrompt("요약해 줘"), true);
});

test("isQuickLanePrompt rejects empty, long, and disguised orchestration prompts", () => {
	assert.equal(isQuickLanePrompt(""), false);
	assert.equal(isQuickLanePrompt("   "), false);
	assert.equal(isQuickLanePrompt("execute plan for the auth migration"), false);
	assert.equal(isQuickLanePrompt("ulw 이게 맞나?"), false);
	const longQuestion = `${"please carefully consider ".repeat(4)}and then answer this whole thing, ok?`;
	assert.equal(isQuickLanePrompt(longQuestion), false, "prompts over 80 chars are not quick-lane");
});

test("runQuickLaneHook injects the directive for host-shaped input", () => {
	const input = { hook_event_name: "UserPromptSubmit", prompt: "이 함수 어디에 정의되어 있어?", transcript_path: null };
	const out = JSON.parse(runQuickLaneHook(input));
	assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
	assert.ok(out.hookSpecificOutput.additionalContext.length > 0, "quick-lane must inject its directive");
});

test("runQuickLaneHook stays silent for non-quick prompts and wrong events", () => {
	assert.equal(runQuickLaneHook({ hook_event_name: "UserPromptSubmit", prompt: "ulw-plan 전체 리팩토링" }), "");
	assert.equal(runQuickLaneHook({ hook_event_name: "Stop", prompt: "이 함수 어디에 정의되어 있어?" }), "");
});
