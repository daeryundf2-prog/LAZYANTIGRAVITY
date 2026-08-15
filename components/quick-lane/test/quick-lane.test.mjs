import test from "node:test";
import assert from "node:assert/strict";
import { isQuickLanePrompt } from "../dist/classifier.js";

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
