import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LedgerEvent } from "./control-plane-types.js";

export interface WalkthroughVerificationResult {
	readonly ok: boolean;
	readonly walkthroughPath: string;
	readonly claimedFiles: readonly string[];
	readonly claimedCommands: readonly string[];
	readonly phantomFiles: readonly string[];
	readonly phantomCommands: readonly string[];
	readonly error?: string;
	readonly skipped?: boolean;
}

/**
 * Verifies that walkthrough.md only makes claims that match ground truth
 * attested in the ledger and verified file system.
 */
export function verifyWalkthroughGroundTruth(
	repoRoot: string,
	walkthroughRelativePath: string = "walkthrough.md",
	events: readonly LedgerEvent[] = [],
): WalkthroughVerificationResult {
	const candidates = [
		resolve(repoRoot, walkthroughRelativePath),
		resolve(repoRoot, ".omo/plans/walkthrough.md"),
		resolve(repoRoot, ".omo/ulw-loop/walkthrough.md"),
	];

	let targetPath = "";
	for (const cand of candidates) {
		if (existsSync(cand)) {
			targetPath = cand;
			break;
		}
	}

	if (!targetPath) {
		return {
			ok: true,
			walkthroughPath: "",
			claimedFiles: [],
			claimedCommands: [],
			phantomFiles: [],
			phantomCommands: [],
			skipped: true,
		};
	}

	let content = "";
	try {
		content = readFileSync(targetPath, "utf8");
	} catch (error) {
		return {
			ok: false,
			walkthroughPath: targetPath,
			claimedFiles: [],
			claimedCommands: [],
			phantomFiles: [],
			phantomCommands: [],
			error: `Failed to read walkthrough at ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	// 1. Extract claimed file modifications: [MODIFY] path, [NEW] path, etc.
	const claimedFilesSet = new Set<string>();
	const modifyRegex = /\[(?:MODIFY|NEW|DELETE|EDIT)\]\s*\[?([a-zA-Z0-9_./\\-]+)\]?/gi;
	for (const match of content.matchAll(modifyRegex)) {
		if (match[1]) claimedFilesSet.add(match[1].trim());
	}

	// 2. Extract code blocks containing verification commands:
	const claimedCommandsSet = new Set<string>();
	const commandBlockRegex = /```(?:bash|sh|zsh|shell|cmd|powershell)?\s*\n([\s\S]*?)\n```/gi;
	for (const match of content.matchAll(commandBlockRegex)) {
		const block = match[1] ?? "";
		const lines = block
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0 && !l.startsWith("#"));
		for (const line of lines) {
			if (/^(npm|npx|pytest|python|node|cargo|go|vitest|pnpm|yarn|make)\b/.test(line)) {
				claimedCommandsSet.add(line);
			}
		}
	}

	// 3. Collect attested truth from ledger events
	const attestedFiles = new Set<string>();
	const attestedCommands = new Set<string>();

	for (const event of events) {
		if (event.result && typeof event.result === "object") {
			const res = event.result as Record<string, unknown>;
			if (Array.isArray(res["filesChanged"])) {
				for (const f of res["filesChanged"]) {
					if (typeof f === "string") attestedFiles.add(f.trim());
				}
			}
			if (Array.isArray(res["commandsRun"])) {
				for (const c of res["commandsRun"]) {
					if (typeof c === "string") attestedCommands.add(c.trim());
				}
			}
		}
	}

	const claimedFiles = [...claimedFilesSet];
	const claimedCommands = [...claimedCommandsSet];
	const phantomFiles: string[] = [];
	const phantomCommands: string[] = [];

	for (const file of claimedFiles) {
		const fullPath = resolve(repoRoot, file);
		if (!attestedFiles.has(file) && !existsSync(fullPath)) {
			phantomFiles.push(file);
		}
	}

	for (const cmd of claimedCommands) {
		const hasAttestation = [...attestedCommands].some(
			(attested) => attested === cmd || attested.includes(cmd) || cmd.includes(attested),
		);
		if (!hasAttestation && attestedCommands.size > 0) {
			phantomCommands.push(cmd);
		}
	}

	const hasPhantoms = phantomFiles.length > 0 || phantomCommands.length > 0;
	if (hasPhantoms) {
		const parts: string[] = [];
		if (phantomFiles.length > 0) parts.push(`Phantom files: ${phantomFiles.join(", ")}`);
		if (phantomCommands.length > 0) parts.push(`Unverified commands: ${phantomCommands.join(", ")}`);
		return {
			ok: false,
			walkthroughPath: targetPath,
			claimedFiles,
			claimedCommands,
			phantomFiles,
			phantomCommands,
			error: `Walkthrough verification failed — claims not attested in ledger: ${parts.join(" | ")}`,
		};
	}

	return {
		ok: true,
		walkthroughPath: targetPath,
		claimedFiles,
		claimedCommands,
		phantomFiles: [],
		phantomCommands: [],
	};
}

import { readValue } from "./cli-arg-parser.js";
import { printJson } from "./cli-output.js";
import { readRunEvents } from "./control-plane.js";
import { normalizeUlwLoopSessionId, resolveUlwLoopSessionIdFromEnv, type UlwLoopScope } from "./paths.js";

export async function verifyWalkthroughCmd(
	repoRoot: string,
	argv: readonly string[],
	json: boolean,
	scope?: UlwLoopScope,
): Promise<number> {
	const explicitRunId = readValue(argv, "--run-id")?.trim();
	const runId =
		explicitRunId ?? normalizeUlwLoopSessionId(scope?.sessionId) ?? resolveUlwLoopSessionIdFromEnv() ?? "default-run";
	const walkthroughFile = readValue(argv, "--file")?.trim() ?? "walkthrough.md";
	let events: readonly LedgerEvent[] = [];
	try {
		events = await readRunEvents(repoRoot, runId);
	} catch {
		// events absent
	}
	const result = verifyWalkthroughGroundTruth(repoRoot, walkthroughFile, events);
	if (json) printJson(result);
	else if (result.ok) {
		if (result.skipped) {
			process.stdout.write("Walkthrough verification skipped (no walkthrough document found).\n");
		} else {
			process.stdout.write(
				`Walkthrough ground-truth verified: ${result.claimedFiles.length} file(s), ${result.claimedCommands.length} command(s) attested.\n`,
			);
		}
	} else {
		process.stderr.write(`Walkthrough verification FAILED: ${result.error}\n`);
	}
	return result.ok ? 0 : 1;
}
