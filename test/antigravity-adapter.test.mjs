import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAntigravityPayload } from "../scripts/antigravity-hook-adapter.mjs";

test("canonical adapter normalizes Antigravity aliases without trusting model output", () => {
	const raw = JSON.stringify({ request_id: "req-1", session_id: "ses-1", cwd: "/workspace", eventName: "PreToolUse", model: { provider: "google", model_id: "gemini-next" }, tool_call: { tool_name: "read_file", arguments: { path: "src/a.ts" }, exit_code: 0 } });
	const envelope = normalizeAntigravityPayload(JSON.parse(raw), raw);
	assert.equal(envelope.schemaVersion, 1);
	assert.equal(envelope.requestId, "req-1");
	assert.equal(envelope.sessionId, "ses-1");
	assert.equal(envelope.event, "pre_tool");
	assert.equal(envelope.model.provider, "google");
	assert.equal(envelope.model.modelId, "gemini-next");
	assert.equal(envelope.tool.name, "read_file");
	assert.deepEqual(envelope.tool.args, { path: "src/a.ts" });
	assert.equal(envelope.tool.exitCode, 0);
	assert.match(envelope.rawPayloadHash, /^[a-f0-9]{64}$/);
});

test("canonical adapter rejects non-object payloads", () => {
	assert.throws(() => normalizeAntigravityPayload([]), /must be an object/);
});
