import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRunEvent, registerPoller } from "../src/control-plane.ts";

const testDir = join(fileURLToPath(new URL(".", import.meta.url)), "test-polling-temp");

beforeEach(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

afterEach(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

describe("Polling Guard Lock", () => {
	it("prevents double poller registration", async () => {
		const runId = "poll-test-1";

		await appendRunEvent(testDir, runId, "run.created", {});

		// First register succeeds
		const now = new Date();
		const poller1 = await registerPoller(testDir, runId, "poller-1", now);
		expect(poller1.pollerId).toBe("poller-1");

		// Second register fails if first is active
		await expect(registerPoller(testDir, runId, "poller-2", now)).rejects.toThrow(
			"Double poller registration blocked",
		);

		// Registering with same ID extends the lease
		const poller1Extended = await registerPoller(testDir, runId, "poller-1", now);
		expect(poller1Extended.pollerId).toBe("poller-1");

		// Second register succeeds if first has expired (e.g. 15 seconds later)
		const later = new Date(now.getTime() + 15000);
		const poller2 = await registerPoller(testDir, runId, "poller-2", poller1.pollerId === "poller-2" ? now : later);
		expect(poller2.pollerId).toBe("poller-2");
	});
});
