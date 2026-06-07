import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ulwLoopCommand } from "../src/cli-commands.js";
import { findLatestRoleCheckpoint, saveRoleCheckpoint, type UlwLimitErrorType } from "../src/role-checkpoint.js";

let testDir: string;
let out: string[];
let err: string[];

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), "ulw-role-checkpoint-"));
	out = [];
	err = [];
	vi.spyOn(process, "cwd").mockReturnValue(testDir);
	vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
		out.push(chunk.toString());
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
		err.push(chunk.toString());
		return true;
	});
});

afterEach(async () => {
	vi.restoreAllMocks();
	await rm(testDir, { recursive: true, force: true });
});

function resetOutput(): void {
	out = [];
	err = [];
}

function stdoutText(): string {
	return out.join("");
}

function stdoutJson(): Record<string, unknown> {
	return JSON.parse(stdoutText());
}

describe("Role Checkpoints & Error Handling", () => {
	it("saves and finds latest role checkpoint directly", async () => {
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
			resumeCommand: "omo ulw-loop resume",
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
			resumeCommand: "omo ulw-loop resume",
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
			resumeCommand: "omo ulw-loop resume",
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
		expect(result.ok).toBe(true);
		expect(result.checkpointPath).toBeDefined();

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
		expect(stdoutJson().ok).toBe(false);

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
			resumeCommand: "omo ulw-loop resume",
		});

		code = await ulwLoopCommand(["resume", "--json"]);
		expect(code).toBe(0);
		const result = stdoutJson();
		expect(result.ok).toBe(true);
		expect(result.checkpoint.taskId).toBe("task-resume");
		expect(result.checkpoint.errorType).toBe("account_quota_exceeded");

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
				resumeCommand: "omo ulw-loop resume",
			});

			const latest = await findLatestRoleCheckpoint(testDir);
			expect(latest?.errorType).toBe(errType);
		});
	}
});
