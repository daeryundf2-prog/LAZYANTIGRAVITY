import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SharedBlackboard } from "../dist/blackboard.js";
import { DaemonServer, getDaemonPaths } from "../dist/server.js";
import { DaemonClient } from "../dist/client.js";

test("SharedBlackboard supports set, get, ttl expiration and list", () => {
	const bb = new SharedBlackboard();
	bb.set("auth_schema", { user: "string", role: "admin" }, { namespace: "auth" });
	bb.set("temp_token", "xyz-123", { ttlMs: 50 });

	assert.deepEqual(bb.get("auth_schema"), { user: "string", role: "admin" });
	assert.equal(bb.get("temp_token"), "xyz-123");

	const listAuth = bb.list("auth");
	assert.equal(listAuth.length, 1);
	assert.equal(listAuth[0].key, "auth_schema");

	// Wait for TTL expiry
	const start = Date.now();
	while (Date.now() - start < 60) {}
	assert.equal(bb.get("temp_token"), null);
});

test("DaemonServer and DaemonClient exchange IPC commands over local socket", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "daemon-ipc-test-"));
	try {
		const config = getDaemonPaths(tempDir);
		const server = new DaemonServer(config);
		await server.start();

					const client = new DaemonClient(config);
			if (process.platform !== "win32") {
				assert.equal(statSync(config.socketPath).mode & 0o777, 0o600);
				assert.equal(statSync(config.tokenPath).mode & 0o777, 0o600);
			}

		const status = await client.status();
		assert.ok(status);
		assert.equal(status.status, "ok");

		const entry = await client.set("agent_task", { id: "worker-1", status: "running" });
		assert.ok(entry);
		assert.equal(entry.key, "agent_task");

		const val = await client.get("agent_task");
		assert.deepEqual(val, { id: "worker-1", status: "running" });

		const list = await client.list();
		assert.equal(list.length, 1);

		await server.stop();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});


test("DaemonServer rejects IPC requests with an invalid token", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "daemon-ipc-auth-test-"));
	try {
		const config = getDaemonPaths(tempDir);
		const server = new DaemonServer(config);
		await server.start();
		const badTokenPath = join(tempDir, "bad.token");
		writeFileSync(badTokenPath, "invalid-token", { encoding: "utf8", mode: 0o600 });
		const client = new DaemonClient({ ...config, tokenPath: badTokenPath });
		const response = await client.send({ cmd: "STATUS" });
		assert.deepEqual(response, { status: "error", error: "Unauthorized" });
		await server.stop();
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
