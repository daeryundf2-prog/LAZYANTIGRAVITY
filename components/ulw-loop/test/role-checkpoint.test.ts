import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulwLoopCommand } from "../src/cli-commands.ts";
import { findLatestRoleCheckpoint, saveRoleCheckpoint, type UlwLimitErrorType } from "../src/role-checkpoint.ts";

const testDir = join(fileURLToPath(new URL(".", import.meta.url)), "test-checkpoints-temp");

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

function stdoutJson(): any {
	return JSON.parse(stdoutText());
}

function resetOutput() {
	stdoutBuffer = [];
	stderrBuffer = [];
}

describe("saveRoleCheckpoint & findLatestRoleCheckpoint", () => {
	it("saves a checkpoint and retrieves it", async () => {
		const checkpoint1 = {
			taskId: "task-1",
			platform: "Antigravity" as const,
			selectedModel: "Gemini 3.5 Flash",
			completedRoles: ["planner"],
			currentRole: "researcher",
			failedRole: "researcher",
			errorType: "model_rate_limited" as const,
			filesChanged: ["src/file1.ts"],
			commandsRun: ["npm run build"],
			artifactsGenerated: [],
			nextRecommendedAction: "Switch to Opus and resume",
			userResumeCommand: "/ulw resume",
			internalResumeCommand: "omo ulw-loop resume",
		};

		const filepath = await saveRoleCheckpoint(testDir, checkpoint1);
		expect(filepath).toContain("ulw-");

		const latest = await findLatestRoleCheckpoint(testDir);
		expect(latest).not.toBeNull();
		expect(latest?.taskId).toBe("task-1");
		expect(latest?.platform).toBe("Antigravity");
		expect(latest?.completedRoles).toContain("planner");
		expect(latest?.errorType).toBe("model_rate_limited");
	});

	it("sorts multiple checkpoints and returns the newest one", async () => {
		const checkpoint1 = {
			taskId: "task-1",
			platform: "Codex" as const,
			selectedModel: "gpt-4o",
			completedRoles: [],
			currentRole: "planner",
			nextRecommendedAction: "None",
			userResumeCommand: "/ulw resume",
			internalResumeCommand: "omo ulw-loop resume",
			filesChanged: [],
			commandsRun: [],
			artifactsGenerated: [],
		};

		const checkpoint2 = {
			taskId: "task-2",
			platform: "Antigravity" as const,
			selectedModel: "Gemini 3.5 Flash",
			completedRoles: ["planner"],
			currentRole: "researcher",
			nextRecommendedAction: "None",
			userResumeCommand: "/ulw resume",
			internalResumeCommand: "omo ulw-loop resume",
			filesChanged: [],
			commandsRun: [],
			artifactsGenerated: [],
		};

		await saveRoleCheckpoint(testDir, checkpoint1);
		// Delay slightly to ensure distinct timestamp if needed, but safeTimestamp/readdir ordering uses iso timestamps
		await new Promise((resolve) => setTimeout(resolve, 5));
		await saveRoleCheckpoint(testDir, checkpoint2);

		const latest = await findLatestRoleCheckpoint(testDir);
		expect(latest?.taskId).toBe("task-2");
		expect(latest?.platform).toBe("Antigravity");
	});

	it("saves checkpoint via CLI", async () => {
		const code = await ulwLoopCommand([
			"save-role-checkpoint",
			"--task-id",
			"task-cli",
			"--platform",
			"Antigravity",
			"--selected-model",
			"Gemini 3.5 Flash",
			"--completed-roles",
			"planner,researcher",
			"--current-role",
			"worker",
			"--failed-role",
			"worker",
			"--error-type",
			"context_window_exceeded",
			"--files-changed",
			"src/cli.ts,src/steering.ts",
			"--commands-run",
			"npm run build,npm run test",
			"--artifacts-generated",
			"task.md",
			"--next-recommended-action",
			"Switch to Claude Opus and resume",
			"--resume-command",
			"omo ulw-loop resume",
			"--json",
		]);

		expect(code).toBe(0);
		const result = stdoutJson();
		expect(result["ok"]).toBe(true);
		expect(result["checkpointPath"]).toBeDefined();

		const latest = await findLatestRoleCheckpoint(testDir);
		expect(latest?.taskId).toBe("task-cli");
		expect(latest?.errorType).toBe("context_window_exceeded");
		expect(latest?.completedRoles).toEqual(["planner", "researcher"]);
		expect(latest?.filesChanged).toEqual(["src/cli.ts", "src/steering.ts"]);
	});

	it("resumes checkpoint via CLI", async () => {
		// First try resuming when no checkpoints exist
		let code = await ulwLoopCommand(["resume", "--json"]);
		expect(code).toBe(1);
		expect(stdoutJson()["ok"]).toBe(false);

		resetOutput();

		// Save a checkpoint first
		await saveRoleCheckpoint(testDir, {
			taskId: "task-resume",
			platform: "Codex",
			selectedModel: "gpt-4o",
			completedRoles: ["planner", "researcher"],
			currentRole: "worker",
			failedRole: "worker",
			errorType: "account_quota_exceeded",
			filesChanged: ["src/a.ts"],
			commandsRun: ["npm test"],
			artifactsGenerated: ["task.md"],
			nextRecommendedAction: "Wait for quota reset or switch account",
			userResumeCommand: "/ulw resume",
			internalResumeCommand: "omo ulw-loop resume",
		});

		code = await ulwLoopCommand(["resume", "--json"]);
		expect(code).toBe(0);
		const result = stdoutJson();
		expect(result["ok"]).toBe(true);
		expect(result["checkpoint"]["taskId"]).toBe("task-resume");
		expect(result["checkpoint"]["errorType"]).toBe("account_quota_exceeded");

		resetOutput();

		// Try without --json (text output)
		code = await ulwLoopCommand(["resume"]);
		expect(code).toBe(0);
		const text = stdoutText();
		expect(text).toContain("Resuming ulw-loop workflow:");
		expect(text).toContain("Task ID: task-resume");
		expect(text).toContain("Error Type: account_quota_exceeded");
	});

	// Verify all requested error types
	const errorTypes: UlwLimitErrorType[] = [
		"context_window_exceeded",
		"output_token_limit",
		"model_rate_limited",
		"account_quota_exceeded",
		"provider_unavailable",
		"unknown_model_error",
	];

	for (const errType of errorTypes) {
		it(`correctly stores and retrieves error type: ${errType}`, async () => {
			await saveRoleCheckpoint(testDir, {
				taskId: `task-${errType}`,
				platform: "Antigravity",
				selectedModel: "model-x",
				completedRoles: ["planner"],
				currentRole: "worker",
				errorType: errType,
				filesChanged: [],
				commandsRun: [],
				artifactsGenerated: [],
				nextRecommendedAction: "action-x",
				userResumeCommand: "/ulw resume",
				internalResumeCommand: "omo ulw-loop resume",
			});

			const latest = await findLatestRoleCheckpoint(testDir);
			expect(latest?.errorType).toBe(errType);
		});
	}
});
