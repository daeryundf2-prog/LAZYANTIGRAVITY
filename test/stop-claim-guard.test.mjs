import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// GUARD_PACK_VERSION 1.0.0 — stop_claim_guard.mjs 의 Stop 훅 계약 검증
// 페이로드 규약: codex-hook.js 와 동일 (hook_event_name, stop_hook_active, last_assistant_message)
// fileURLToPath 필수 — Windows에서 URL.pathname은 /C:/... 형태라 모듈 해석이 깨진다
const GUARD = fileURLToPath(new URL("../scripts/stop_claim_guard.mjs", import.meta.url));

function stopPayload(fields) {
	return JSON.stringify({
		hook_event_name: "Stop",
		session_id: "s",
		turn_id: "t",
		transcript_path: "/tmp/x",
		cwd: process.cwd(),
		model: "m",
		permission_mode: "p",
		stop_hook_active: false,
		...fields,
	});
}

function runGuard(payload) {
	return spawnSync("node", [GUARD], { input: payload, encoding: "utf8" });
}

test("blocks grand completion claim without evidence", () => {
	const res = runGuard(
		stopPayload({ last_assistant_message: "검증과 수정이 모두 끝났습니다. 100% 전수 일치를 확인했습니다." }),
	);
	assert.equal(res.status, 0, `stderr: ${res.stderr}`);
	const out = JSON.parse(res.stdout);
	assert.equal(out.decision, "block");
	assert.match(out.reason, /STOP CLAIM GUARD/);
});

test("passes claim backed by test counts and artifact paths", () => {
	const res = runGuard(
		stopPayload({
			last_assistant_message: "모두 반영했습니다. uv run pytest → 98 passed, 산출물은 skills/boost/SKILL.md, 커밋 1464e7a.",
		}),
	);
	assert.equal(res.status, 0);
	assert.equal(res.stdout.trim(), "{}");
});

test("passes plain factual report without grand claims", () => {
	const res = runGuard(stopPayload({ last_assistant_message: "3개 파일을 읽었습니다. 미확인 항목은 그대로 두었습니다." }));
	assert.equal(res.status, 0);
	assert.equal(res.stdout.trim(), "{}");
});

test("never blocks twice — stop_hook_active short-circuits", () => {
	const res = runGuard(stopPayload({ stop_hook_active: true, last_assistant_message: "완료. 100%." }));
	assert.equal(res.status, 0);
	assert.equal(res.stdout.trim(), "{}");
});

test("SubagentStop gets the same treatment (worker DoneClaim is untrusted)", () => {
	const res = runGuard(stopPayload({ hook_event_name: "SubagentStop", last_assistant_message: "전부 완료했습니다." }));
	assert.equal(res.status, 0);
	const out = JSON.parse(res.stdout);
	assert.equal(out.decision, "block");
});

test("missing or unparseable payload degrades to no-op", () => {
	assert.equal(runGuard("not json at all").status, 0);
	assert.equal(runGuard("").status, 0);
	assert.equal(runGuard(stopPayload({})).status, 0); // last_assistant_message 없음
});

test("guard version is pinned", async () => {
	const { readFile } = await import("node:fs/promises");
	const text = await readFile(GUARD, "utf8");
	assert.match(text, /GUARD_PACK_VERSION:\s*1\.0\.0/);
});

test("passes disciplined strict abstention [INSUFFICIENT_DATA] (Feature 09)", () => {
	const res = runGuard(
		stopPayload({
			last_assistant_message: "일부 작업은 완료했으나 [INSUFFICIENT_DATA: 외부 API 접근 권한 부족]으로 인해 보류했습니다.",
		}),
	);
	assert.equal(res.status, 0);
	assert.equal(res.stdout.trim(), "{}");
});

test("blocks fabricated phantom file claims via Fact-Retracing Gate (Feature 15)", async () => {
	const { writeFileSync, unlinkSync } = await import("node:fs");
	const transcript = join(process.cwd(), "temp-test-transcript.jsonl");
	writeFileSync(transcript, JSON.stringify({ event: "tool_use", tool: "run_command", output: "ok" }), "utf8");

	try {
		const res = runGuard(
			stopPayload({
				transcript_path: transcript,
				last_assistant_message: "모두 완료했습니다. 산출물: nonexistent_phantom_module.ts 작성 완료.",
			}),
		);
		assert.equal(res.status, 0);
		const out = JSON.parse(res.stdout);
		assert.equal(out.decision, "block");
		assert.match(out.reason, /사실 역추적\(Fact-Retracing\) 실패/);
		assert.match(out.reason, /nonexistent_phantom_module\.ts/);
	} finally {
		try { unlinkSync(transcript); } catch {}
	}
});

test("blocks fabricated phantom file claims even when transcript is missing or null", () => {
	const res = runGuard(
		stopPayload({
			transcript_path: null,
			last_assistant_message: "모두 완료했습니다. 산출물: nonexistent_phantom_file.ts 작성 완료.",
		}),
	);
	assert.equal(res.status, 0);
	const out = JSON.parse(res.stdout);
	assert.equal(out.decision, "block");
	assert.match(out.reason, /사실 역추적\(Fact-Retracing\) 실패/);
	assert.match(out.reason, /nonexistent_phantom_file\.ts/);
});

test("blocks fabricated Windows backslash and Korean phantom paths", () => {
	const res = runGuard(
		stopPayload({
			transcript_path: null,
			last_assistant_message: "모두 완료했습니다. 산출물: 가짜_폴더\\가짜_파일.ts 작성 완료.",
		}),
	);
	assert.equal(res.status, 0);
	const out = JSON.parse(res.stdout);
	assert.equal(out.decision, "block");
	assert.match(out.reason, /사실 역추적\(Fact-Retracing\) 실패/);
});

test("blocks fabricated Windows absolute drive paths via Fact-Retracing Gate", () => {
	const res = runGuard(
		stopPayload({
			transcript_path: null,
			last_assistant_message: "모두 완료했습니다. pytest 10 passed. 산출물: C:\\phantom_drive\\fake_artifact.ts 작성 완료.",
		}),
	);
	assert.equal(res.status, 0);
	const out = JSON.parse(res.stdout);
	assert.equal(out.decision, "block");
	assert.match(out.reason, /사실 역추적\(Fact-Retracing\) 실패/);
	assert.match(out.reason, /fake_artifact\.ts/);
});

test("retraces Korean particle attached file claims", () => {
	const res = runGuard(
		stopPayload({
			transcript_path: null,
			last_assistant_message: "모두 수정했습니다. 산출물은 nonexistent_particle_file.py 파일입니다.",
		}),
	);
	assert.equal(res.status, 0);
	const out = JSON.parse(res.stdout);
	assert.equal(out.decision, "block");
	assert.match(out.reason, /사실 역추적\(Fact-Retracing\) 실패/);
});



