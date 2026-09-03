import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// GUARD_PACK_VERSION 1.0.0 — markdown_structure_guard.mjs 의 훅/CLI 계약 검증
// fileURLToPath 필수 — Windows에서 URL.pathname은 /C:/... 형태라 모듈 해석이 깨진다
const GUARD = fileURLToPath(new URL("../scripts/markdown_structure_guard.mjs", import.meta.url));

function runGuard(stdinPayload) {
	return spawnSync("node", [GUARD], {
		input: stdinPayload,
		encoding: "utf8",
	});
}

test("blocks empty link + empty bullet markdown with exit 1", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	const file = join(dir, "doc.md");
	writeFileSync(file, "# t\n\n-  : 본문\n\n[](https://example.com)\n", "utf8");
	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 1, `stderr: ${res.stderr}`);
	assert.match(res.stderr, /empty_link_text/);
	assert.match(res.stderr, /empty_bullet_before_colon/);
});

test("passes clean markdown (exit 0)", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	const file = join(dir, "doc.md");
	writeFileSync(file, "# t\n\n[텍스트](https://example.com)\n\n- **라벨**: 내용\n", "utf8");
	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 0, `stderr: ${res.stderr}`);
});

test("does not count $ inside inline code or NTFS attribute names (false-positive guard)", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	const file = join(dir, "doc.md");
	writeFileSync(file, "`$MFT` 와 $STANDARD_INFORMATION 는 NTFS 속성이다. `$SI`도.\n", "utf8");
	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 0, `stderr: ${res.stderr}`);
});

test("blocks unbalanced math delimiter outside code (real stripping signature)", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	const file = join(dir, "doc.md");
	writeFileSync(file, "전력 법칙: /f^\\alpha$ 이탈 — 선행 토큰이 잘렸다.\n", "utf8");
	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 1, `stderr: ${res.stderr}`);
	assert.match(res.stderr, /orphan_math_delimiter/);
});

test("non-markdown targets are skipped (exit 0)", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	const file = join(dir, "note.txt");
	writeFileSync(file, "-  : 이런 내용도 txt 는 감시 대상이 아니다\n", "utf8");
	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 0);
});

test("missing file is skipped, not a failure", () => {
	const res = runGuard(JSON.stringify({ tool_input: { file_path: "/nonexistent/xyz.md" } }));
	assert.equal(res.status, 0);
});

test("--check mode aggregates findings across a directory", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	writeFileSync(join(dir, "bad.md"), "[](https://x.com)\n", "utf8");
	writeFileSync(join(dir, "good.md"), "[ok](https://x.com)\n", "utf8");
	const res = spawnSync("node", [GUARD, "--check", dir], { encoding: "utf8" });
	assert.equal(res.status, 1, `stderr: ${res.stderr}`);
	assert.match(res.stderr, /FAIL 1개/);
});

test("blocks unclosed evidence tag and empty evidence block (Feature 10)", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	const file1 = join(dir, "unclosed.md");
	writeFileSync(file1, "# Title\n\n<evidence>원문 인용\n<answer>답변</answer>\n", "utf8");
	const res1 = runGuard(JSON.stringify({ tool_input: { file_path: file1 } }));
	assert.equal(res1.status, 1);
	assert.match(res1.stderr, /unclosed_evidence_tag/);

	const file2 = join(dir, "empty_evidence.md");
	writeFileSync(file2, "# Title\n\n<evidence></evidence>\n<answer>답변</answer>\n", "utf8");
	const res2 = runGuard(JSON.stringify({ tool_input: { file_path: file2 } }));
	assert.equal(res2.status, 1);
	assert.match(res2.stderr, /empty_evidence_block/);
});

test("blocks broken inline citation tokens (Feature 02 LangExtract)", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	const file = join(dir, "broken_cite.md");
	writeFileSync(file, "이 내용은 【F:README.md†L10-L15】 에서 발췌되었다.\n", "utf8");
	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 1);
	assert.match(res.stderr, /broken_citation_token/);
});

test("blocks multiline empty evidence block and allows tags/citations inside inline code", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdguard-"));
	const multiEmpty = join(dir, "multi_empty.md");
	writeFileSync(multiEmpty, "# Title\n\n<evidence>\n\n</evidence>\n<answer>답변</answer>\n", "utf8");
	const res1 = runGuard(JSON.stringify({ tool_input: { file_path: multiEmpty } }));
	assert.equal(res1.status, 1);
	assert.match(res1.stderr, /empty_evidence_block/);

	const codeDoc = join(dir, "doc_with_code.md");
	writeFileSync(codeDoc, "# Rules\n\nUse `<evidence>` and `【F:README.md†L1-L10】` as examples.\n\n```markdown\n<evidence>\ncode sample\n```\n", "utf8");
	const res2 = runGuard(JSON.stringify({ tool_input: { file_path: codeDoc } }));
	assert.equal(res2.status, 0, `stderr: ${res2.stderr}`);
});

