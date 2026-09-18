import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeHostCommand } from "../dist/host-executor.js";

test("Host executor creates output fingerprints from actual execution output", async (t) => {
	const cwd = mkdtempSync(join(tmpdir(), "host-executor-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	const result = await executeHostCommand({ command: process.execPath, args: ["-e", "process.stdout.write('ok')"], cwd, requestId: "req-1", runId: "run-1", sessionId: "session-1", toolCallId: "tool-1" });
	assert.equal(result.exitCode, 0);
	assert.equal(result.stdout, "ok");
	assert.equal(result.binding.stdoutFingerprint, createHash("sha256").update("ok").digest("hex"));
	assert.equal(result.binding.stderrFingerprint, createHash("sha256").update("").digest("hex"));
	assert.equal(result.binding.requestId, "req-1");
});
