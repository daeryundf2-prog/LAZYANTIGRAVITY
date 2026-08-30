import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";

// GUARD_PACK_VERSION 1.0.0 — coverage_audit.mjs 계약: 원문 없는 감사는 구조적으로 불가능하다.
const AUDIT = new URL("../scripts/coverage_audit.mjs", import.meta.url).pathname;

const SOURCE = [
	"# 감사 대상 원문",
	"",
	"| 도구 | 용도 |",
	"|---|---|",
	"| parse_ntfs | MFT 파싱 |",
	"| hash_audit | SHA-256 감사 |",
	"- verify_report: 보고서 검증기",
].join("\n");

const TARGET_FULL = [
	"# 산출물",
	"",
	"- parse_ntfs: MFT 파싱 수행",
	"- hash_audit: SHA-256 감사 수행",
	"- verify_report: 보고서 검증기 포함",
].join("\n");

const TARGET_BROKEN = [
	"# 산출물 (verify_report만 수록)",
	"",
	"- verify_report: 보고서 검증기 포함",
].join("\n");

function setup() {
	const dir = mkdtempSync(join(tmpdir(), "covaudit-"));
	writeFileSync(join(dir, "source.md"), SOURCE, "utf8");
	writeFileSync(join(dir, "target_full.md"), TARGET_FULL, "utf8");
	writeFileSync(join(dir, "target_broken.md"), TARGET_BROKEN, "utf8");
	return dir;
}

function run(args) {
	return spawnSync("node", [AUDIT, ...args], { encoding: "utf8", timeout: 60_000 });
}

test("refuses to run without --source (circular audit blocked)", () => {
	const dir = setup();
	const res = run(["--target", join(dir, "target_full.md")]);
	assert.equal(res.status, 2);
	assert.match(res.stderr, /감사 거부/);
	assert.match(res.stderr, /순환 감사/);
});

test("full coverage passes with per-item mapping receipt", () => {
	const dir = setup();
	const receiptPath = join(dir, "receipt.json");
	const res = run([
		"--source", join(dir, "source.md"),
		"--target", join(dir, "target_full.md"),
		"--json", receiptPath,
	]);
	assert.equal(res.status, 0, res.stderr);
	const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
	assert.equal(receipt.verdict, "PASS");
	assert.equal(receipt.totalItems, 3); // 표 헤더 행은 계수하지 않는다
	assert.equal(receipt.missingItems, 0);
	const expectedSha = createHash("sha256").update(SOURCE).digest("hex");
	assert.equal(receipt.source.sha256, expectedSha);
});

test("missing items fail with source-line blame", () => {
	const dir = setup();
	const receiptPath = join(dir, "receipt.json");
	const res = run([
		"--source", join(dir, "source.md"),
		"--target", join(dir, "target_broken.md"),
		"--json", receiptPath,
	]);
	assert.equal(res.status, 1);
	const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
	assert.equal(receipt.verdict, "FAIL");
	assert.equal(receipt.missingItems, 2);
	// 산출물 제목에 단어가 등장해도(오염된 제목) 강한 키 규칙이 정확한 누락 판정을 유지한다
	const missingLines = receipt.missing.map((m) => m.sourceLine).sort((a, b) => a - b);
	assert.deepEqual(missingLines, [5, 6]);
});

test("minimum threshold can be relaxed via --min", () => {
	const dir = setup();
	const res = run(["--source", join(dir, "source.md"), "--target", join(dir, "target_broken.md"), "--min", "0.2"]);
	assert.equal(res.status, 0);
});
