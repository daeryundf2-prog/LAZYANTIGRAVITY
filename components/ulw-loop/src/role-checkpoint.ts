import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type UlwLimitErrorType =
	| "context_window_exceeded"
	| "output_token_limit"
	| "model_rate_limited"
	| "account_quota_exceeded"
	| "provider_unavailable"
	| "unknown_model_error";

export interface UlwRoleCheckpoint {
	readonly taskId: string;
	readonly platform: "Antigravity" | "Codex";
	readonly selectedModel: string;
	readonly completedRoles: readonly string[];
	readonly currentRole: string;
	readonly failedRole?: string;
	readonly errorType?: UlwLimitErrorType;
	readonly filesChanged: readonly string[];
	readonly commandsRun: readonly string[];
	readonly artifactsGenerated: readonly string[];
	readonly nextRecommendedAction: string;
	readonly userResumeCommand: string;
	readonly internalResumeCommand: string;
	readonly timestamp: string;
	readonly dryRun?: boolean;
}

export async function saveRoleCheckpoint(
	repoRoot: string,
	data: Omit<UlwRoleCheckpoint, "timestamp">,
): Promise<string> {
	const checkpointsDir = join(repoRoot, ".lazycodex", "checkpoints");
	if (!existsSync(checkpointsDir)) {
		await mkdir(checkpointsDir, { recursive: true });
	}
	const timestamp = new Date().toISOString();
	// Replace colons for Windows filename compatibility
	const safeTimestamp = timestamp.replace(/:/g, "-");
	const filename = `${data.dryRun ? "dryrun" : "ulw"}-${safeTimestamp}.json`;
	const filepath = join(checkpointsDir, filename);

	const checkpoint: UlwRoleCheckpoint = {
		...data,
		timestamp,
	};

	await writeFile(filepath, JSON.stringify(checkpoint, null, 2), "utf8");
	return filepath;
}

export async function findLatestRoleCheckpoint(repoRoot: string): Promise<UlwRoleCheckpoint | null> {
	const checkpointsDir = join(repoRoot, ".lazycodex", "checkpoints");
	if (!existsSync(checkpointsDir)) {
		return null;
	}

	const files = await readdir(checkpointsDir);
	const ulwFiles = files.filter((file) => file.startsWith("ulw-") && file.endsWith(".json"));

	if (ulwFiles.length === 0) {
		return null;
	}

	// Sort files by name (which has the ISO timestamp) to get the latest
	ulwFiles.sort();
	const latestFile = ulwFiles[ulwFiles.length - 1];
	if (!latestFile) {
		return null;
	}

	const filepath = join(checkpointsDir, latestFile);
	const content = await readFile(filepath, "utf8");
	return JSON.parse(content) as UlwRoleCheckpoint;
}
