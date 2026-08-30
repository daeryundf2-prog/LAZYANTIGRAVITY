import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// GUARD_PACK_VERSION 1.0.0 — stop_claim_guard.mjs 의 Stop 훅 계약 검증
// 페이로드 규약: codex-hook.js 와 동일 (hook_event_name, stop_hook_active, last_assistant_message)
const GUARD = new URL("../scripts/stop_claim_guard.mjs", import.meta.url).pathname;

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
			last_assistant_message: "모두 반영했습니다. uv run pytest → 98 passed, 산출물은 skills/x/SKILL.md, 커밋 1464e7a.",
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
