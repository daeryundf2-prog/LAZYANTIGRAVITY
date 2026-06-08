import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulwLoopCommand } from "../src/cli-commands.ts";

const testDir = join(fileURLToPath(new URL(".", import.meta.url)), "test-dryrun-temp");

let stdoutBuffer: string[] = [];
let stderrBuffer: string[] = [];

const originalWrite = process.stdout.write;
const originalErrWrite = process.stderr.write;

beforeEach(() => {
	vi.spyOn(process, "cwd").mockReturnValue(testDir);
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
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

function stdoutText(): string {
	return stdoutBuffer.join("");
}

function stderrText(): string {
	return stderrBuffer.join("");
}

// biome-ignore lint/suspicious/noExplicitAny: parsed JSON output test helper
function stdoutJson(): any {
	return JSON.parse(stdoutText());
}

function resetOutput(): void {
	stdoutBuffer = [];
	stderrBuffer = [];
}

describe("ulw-loop dry-run simulator", () => {
	it("prints usage for help arguments and exits without running scenarios or saving checkpoints", async () => {
		const helpArgs = [
			["dry-run", "--help"],
			["dry-run", "-h"],
			["dry-run", "help"],
		];
		for (const args of helpArgs) {
			resetOutput();
			const code = await ulwLoopCommand(args);
			expect(code).toBe(0);

			const text = stdoutText();
			expect(text).toContain("Usage:");
			expect(text).toContain("Scenarios:");
			expect(text).toContain("Options:");
			expect(text).not.toContain("[Dry-Run] Running role");
			expect(text).not.toContain("Saved checkpoint:");

			const checkpointDir = join(testDir, ".lazycodex", "checkpoints");
			expect(existsSync(checkpointDir)).toBe(false);
		}
	});

	it("supports --json output for help arguments", async () => {
		const code = await ulwLoopCommand(["dry-run", "--help", "--json"]);
		expect(code).toBe(0);

		const data = stdoutJson();
		expect(data.ok).toBe(true);
		expect(data.dryRun).toBe(true);
		expect(data.usage).toBe(true);
		expect(data.scenarios).toContain("happy-path");
		expect(data.options).toContain("--write-checkpoint");
	});

	it("executes happy-path scenario with human-readable text output", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "happy-path"]);
		expect(code).toBe(0);

		const text = stdoutText();
		expect(text).toContain("planner");
		expect(text).toContain("researcher");
		expect(text).toContain("worker");
		expect(text).toContain("verifier");
		expect(text).toContain("finalizer");
		expect(text).toContain("Happy-path complete successfully!");
		expect(text).toContain("wouldSwitchModel: false");

		// happy-path should NOT save a checkpoint file
		const checkpointDir = join(testDir, ".lazycodex", "checkpoints");
		expect(existsSync(checkpointDir)).toBe(false);
	});

	it("executes happy-path scenario with JSON output", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "happy-path", "--json"]);
		expect(code).toBe(0);

		const data = stdoutJson();
		expect(data.ok).toBe(true);
		expect(data.dryRun).toBe(true);
		expect(data.platform).toBe("Antigravity");
		expect(data.scenario).toBe("happy-path");
		expect(data.wouldSwitchModel).toBe(false);
		expect(data.wouldCallModelApi).toBe(false);
		expect(data.wouldModifySourceFiles).toBe(false);
		expect(data.checkpointPath).toBeNull();
		expect(data.roles).toEqual(["planner", "researcher", "worker", "verifier", "finalizer"]);
		expect(data.completedRoles).toEqual(["planner", "researcher", "worker", "verifier", "finalizer"]);
		expect(data.failedRole).toBeNull();
		expect(data.errorType).toBeNull();
	});

	it("executes quota-opus-exhausted scenario with human-readable output (no checkpoint by default)", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "quota-opus-exhausted"]);
		expect(code).toBe(0);

		const text = stdoutText();
		expect(text).toContain("model_rate_limited");
		expect(text).toContain("worker");
		expect(text).toContain("- FAILED");
		expect(text).toContain("wouldSwitchModel: false");
		expect(text).toContain("Checkpoint Path: None");

		// Checkpoint file should NOT be created
		const checkpointDir = join(testDir, ".lazycodex", "checkpoints");
		expect(existsSync(checkpointDir)).toBe(false);
	});

	it("executes quota-opus-exhausted scenario with JSON output (no checkpoint by default)", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "quota-opus-exhausted", "--json"]);
		expect(code).toBe(0);

		const data = stdoutJson();
		expect(data.ok).toBe(true);
		expect(data.dryRun).toBe(true);
		expect(data.wouldSwitchModel).toBe(false);
		expect(data.wouldCallModelApi).toBe(false);
		expect(data.wouldModifySourceFiles).toBe(false);
		expect(data.completedRoles).toEqual(["planner", "researcher"]);
		expect(data.failedRole).toBe("worker");
		expect(data.errorType).toBe("model_rate_limited");
		expect(data.checkpointPath).toBeNull();
	});

	it("executes quota-opus-exhausted scenario with --write-checkpoint and saves checkpoint", async () => {
		const code = await ulwLoopCommand([
			"dry-run",
			"--scenario",
			"quota-opus-exhausted",
			"--json",
			"--write-checkpoint",
		]);
		expect(code).toBe(0);

		const data = stdoutJson();
		expect(data.ok).toBe(true);
		expect(data.checkpointPath).not.toBeNull();
		expect(data.checkpointPath).toContain("dryrun-");

		// Read and verify the saved checkpoint file content
		const checkpointContent = JSON.parse(readFileSync(data.checkpointPath, "utf8"));
		expect(checkpointContent.taskId).toBe("dry-run-task-quota");
		expect(checkpointContent.platform).toBe("Antigravity");
		expect(checkpointContent.errorType).toBe("model_rate_limited");
		expect(checkpointContent.completedRoles).toEqual(["planner", "researcher"]);
		expect(checkpointContent.currentRole).toBe("worker");
		expect(checkpointContent.failedRole).toBe("worker");
		expect(checkpointContent.dryRun).toBe(true);
	});

	it("executes context-window-exceeded scenario and guides on compact mode", async () => {
		const code = await ulwLoopCommand([
			"dry-run",
			"--scenario",
			"context-window-exceeded",
			"--json",
			"--write-checkpoint",
		]);
		expect(code).toBe(0);

		const data = stdoutJson();
		expect(data.errorType).toBe("context_window_exceeded");
		expect(data.completedRoles).toEqual(["planner"]);
		expect(data.failedRole).toBe("researcher");

		const checkpointContent = JSON.parse(readFileSync(data.checkpointPath, "utf8"));
		expect(checkpointContent.errorType).toBe("context_window_exceeded");
		expect(checkpointContent.dryRun).toBe(true);
	});

	it("executes output-token-limit scenario and guides on batch mode", async () => {
		const code = await ulwLoopCommand([
			"dry-run",
			"--scenario",
			"output-token-limit",
			"--json",
			"--write-checkpoint",
		]);
		expect(code).toBe(0);

		const data = stdoutJson();
		expect(data.errorType).toBe("output_token_limit");
		expect(data.completedRoles).toEqual(["planner", "researcher"]);
		expect(data.failedRole).toBe("worker");

		const checkpointContent = JSON.parse(readFileSync(data.checkpointPath, "utf8"));
		expect(checkpointContent.errorType).toBe("output_token_limit");
		expect(checkpointContent.dryRun).toBe(true);
	});

	it("executes provider-unavailable scenario and guides on waiting/retries", async () => {
		const code = await ulwLoopCommand([
			"dry-run",
			"--scenario",
			"provider-unavailable",
			"--json",
			"--write-checkpoint",
		]);
		expect(code).toBe(0);

		const data = stdoutJson();
		expect(data.errorType).toBe("provider_unavailable");
		expect(data.completedRoles).toEqual(["planner"]);
		expect(data.failedRole).toBe("researcher");

		const checkpointContent = JSON.parse(readFileSync(data.checkpointPath, "utf8"));
		expect(checkpointContent.errorType).toBe("provider_unavailable");
		expect(checkpointContent.dryRun).toBe(true);
	});

	it("returns code 1 and logs error for unknown scenarios", async () => {
		const code = await ulwLoopCommand(["dry-run", "--scenario", "invalid-scenario-name"]);
		expect(code).toBe(1);

		const errText = stderrText();
		expect(errText).toContain("Unknown scenario: invalid-scenario-name");
	});
});
