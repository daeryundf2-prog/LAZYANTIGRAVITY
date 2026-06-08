import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { dryRunCmd } from "../src/dry-run.js";

// Mock process.stdout.write to capture output
let output = "";
const mockStdoutWrite = (str: string | Uint8Array) => {
	output += str.toString();
	return true;
};

// Also mock process.stderr.write
const mockStderrWrite = (str: string | Uint8Array) => {
	output += str.toString();
	return true;
};

describe("Dry-Run Stagnation Scenarios", () => {
	const originalStdoutWrite = process.stdout.write;
	const originalStderrWrite = process.stderr.write;

	beforeEach(() => {
		output = "";
		process.stdout.write = mockStdoutWrite as any;
		process.stderr.write = mockStderrWrite as any;
	});

	afterEach(() => {
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
	});

	it("should simulate same-error-loop and keep wouldSwitchModel false", async () => {
		const code = await dryRunCmd(".", ["ulw-loop", "dry-run", "--scenario", "same-error-loop"], false);
		expect(code).toBe(0);
		expect(output).toContain("StagnationGuard triggered: same_error_loop");
		expect(output).toContain("Emitting parent.stagnation_detected event. Run not marked failed directly.");
		expect(output).toContain("wouldSwitchModel: false");
	});

	it("should simulate oscillating-patch and keep wouldSwitchModel false", async () => {
		const code = await dryRunCmd(".", ["ulw-loop", "dry-run", "--scenario", "oscillating-patch"], false);
		expect(code).toBe(0);
		expect(output).toContain("StagnationGuard triggered: oscillation_detected");
		expect(output).toContain("Emitting parent.stagnation_detected event.");
		expect(output).toContain("wouldSwitchModel: false");
	});

	it("should simulate heartbeat-only-stall and keep wouldSwitchModel false", async () => {
		const code = await dryRunCmd(".", ["ulw-loop", "dry-run", "--scenario", "heartbeat-only-stall"], false);
		expect(code).toBe(0);
		expect(output).toContain("StagnationGuard triggered: heartbeat_only_stall");
		expect(output).toContain("Emitting parent.stagnation_detected event.");
		expect(output).toContain("wouldSwitchModel: false");
	});

	it("should simulate no-evidence-progress and keep wouldSwitchModel false", async () => {
		const code = await dryRunCmd(".", ["ulw-loop", "dry-run", "--scenario", "no-evidence-progress"], false);
		expect(code).toBe(0);
		expect(output).toContain("StagnationGuard triggered: no_evidence_progress");
		expect(output).toContain("Emitting parent.stagnation_detected event.");
		expect(output).toContain("wouldSwitchModel: false");
	});
});
