import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulwLoopCommand } from "../src/cli-commands.ts";

let stdoutBuffer: string[] = [];
let stderrBuffer: string[] = [];

const originalWrite = process.stdout.write;
const originalErrWrite = process.stderr.write;

beforeEach(() => {
	stdoutBuffer = [];
	stderrBuffer = [];
	process.stdout.write = (str: string | Uint8Array) => {
		stdoutBuffer.push(typeof str === "string" ? str : str.toString());
		return true;
	};
	process.stderr.write = (str: string | Uint8Array) => {
		stderrBuffer.push(typeof str === "string" ? str : str.toString());
		return true;
	};
});

afterEach(() => {
	vi.restoreAllMocks();
	process.stdout.write = originalWrite;
	process.stderr.write = originalErrWrite;
});

function stdoutText(): string {
	return stdoutBuffer.join("");
}

describe("Dry-run Control Plane Scenarios CLI", () => {
	it("runs subagent-self-finalizes scenario", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "subagent-self-finalizes"]);
		expect(code).toBe(0);
		const text = stdoutText();
		expect(text).toContain("[Dry-Run] Initializing subagent-self-finalizes scenario...");
		expect(text).toContain("Parent rejected result envelope: Forbidden phrase detected");
		expect(text).toContain("Reconstructed agent state: orphaned");
	});

	it("runs stale-heartbeat-missed scenario", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "stale-heartbeat-missed"]);
		expect(code).toBe(0);
		const text = stdoutText();
		expect(text).toContain("[Dry-Run] Initializing stale-heartbeat-missed scenario...");
		expect(text).toContain("Agent worker-stale assignment state: stale_candidate");
	});

	it("runs polling-loop-prevented scenario", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "polling-loop-prevented"]);
		expect(code).toBe(0);
		const text = stdoutText();
		expect(text).toContain("[Dry-Run] Initializing polling-loop-prevented scenario...");
		expect(text).toContain("Registering poller-2 failed: Double poller registration blocked");
	});

	it("runs parent-progress-reconstruct scenario", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "parent-progress-reconstruct"]);
		expect(code).toBe(0);
		const text = stdoutText();
		expect(text).toContain("[Dry-Run] Initializing parent-progress-reconstruct scenario...");
		expect(text).toContain("Reconstructed global run state: researching");
		expect(text).toContain("Researcher state: running");
		expect(text).toContain("Researcher progress: Searching files...");
	});

	it("runs subagent-wrong-role-envelope scenario", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "subagent-wrong-role-envelope"]);
		expect(code).toBe(0);
		const text = stdoutText();
		expect(text).toContain("[Dry-Run] Initializing subagent-wrong-role-envelope scenario...");
		expect(text).toContain("Rejects wrong role envelope: Role mismatch: expected worker, got researcher");
	});

	it("runs hitl-scenario", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "hitl-scenario"]);
		expect(code).toBe(0);
		const text = stdoutText();
		expect(text).toContain("[Dry-Run] Initializing hitl-scenario...");
		expect(text).toContain("HITL Triggered: true");
		expect(text).toContain("Event Type: parent.hitl_required");
	});
});
