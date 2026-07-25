import test from "node:test";
import assert from "node:assert/strict";
import { cleanCjkSpacing } from "../scripts/clean-cjk-spacing.mjs";

test("cleanCjkSpacing: Normalizes Jamo decomposition (NFC)", () => {
	// NFD decomposed "대한민국"
	const decomposed = "대한민국".normalize("NFD");
	assert.notEqual(decomposed, "대한민국");
	const cleaned = cleanCjkSpacing(decomposed);
	assert.equal(cleaned, "대한민국");
});

test("cleanCjkSpacing: Collapses multiple spaces and limits consecutive empty lines", () => {
	assert.equal(cleanCjkSpacing("hello    world"), "hello world");
	assert.equal(cleanCjkSpacing("line1\n\n\n\nline2"), "line1\n\nline2");
});

test("cleanCjkSpacing: Removes spaces between Chinese/Japanese characters", () => {
	assert.equal(cleanCjkSpacing("中 文 🚀 日 本 語"), "中文 🚀 日本語");
});

test("cleanCjkSpacing: Collapses spaced-out Hangul of 4 or more chars but leaves 3 or fewer untouched", () => {
	assert.equal(cleanCjkSpacing("대 한 민 국"), "대한민국");
	assert.equal(cleanCjkSpacing("나 는 너"), "나 는 너");
});

test("cleanCjkSpacing: Standardizes CJK/alphanumeric boundaries (adds a space)", () => {
	assert.equal(cleanCjkSpacing("한글abc"), "한글 abc");
	assert.equal(cleanCjkSpacing("abc한글"), "abc 한글");
	assert.equal(cleanCjkSpacing("中文123"), "中文 123");
	assert.equal(cleanCjkSpacing("123中文"), "123 中文");
});
