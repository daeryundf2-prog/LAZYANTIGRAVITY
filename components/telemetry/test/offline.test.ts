import { afterEach, expect, it, vi } from "vitest";
import { isTelemetryOptedIn, shouldDisablePostHog } from "../src/env-flags.js";

vi.mock("posthog-node", () => {
	throw new Error("Offline must not load a network client");
});
afterEach(() => vi.unstubAllEnvs());
it("#given offline overrides all opt-ins #when creating telemetry #then no network client is loaded", async () => {
	vi.stubEnv("LAZYANTIGRAVITY_OFFLINE", "1");
	vi.stubEnv("LAZYANTIGRAVITY_TELEMETRY_OPT_IN", "1");
	vi.stubEnv("OMO_SEND_ANONYMOUS_TELEMETRY", "1");
	vi.stubEnv("POSTHOG_API_KEY", "fake-test-key");
	expect(isTelemetryOptedIn()).toBe(false);
	expect(shouldDisablePostHog()).toBe(true);
	const { createPluginPostHog } = await import("../src/posthog.js");
	const client = await createPluginPostHog();
	client.trackActive("fake-id", "session_start");
	await client.shutdown();
});
