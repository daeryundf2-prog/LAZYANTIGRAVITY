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
