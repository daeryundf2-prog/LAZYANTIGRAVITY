import { readValue } from "./cli-arg-parser.js";
import { printJson } from "./cli-output.js";
import { aggregateConsensus, dispatchConsensus, reportConsensusResult } from "./consensus-dispatcher.js";
import { UlwLoopError } from "./types.js";

function required(argv: readonly string[], flag: string): string {
	const value = readValue(argv, flag)?.trim();
	if (!value) {
		throw new UlwLoopError(`Missing ${flag}.`, "ULW_LOOP_ARGUMENT_MISSING", { details: { flag } });
	}
	if ((flag === "--run-id" || flag === "--agent-id" || flag === "--consensus-id") && !/^[A-Za-z0-9._-]+$/.test(value)) {
		throw new UlwLoopError(`Invalid ${flag}: must match ^[A-Za-z0-9._-]+$`, "ULW_LOOP_ARGUMENT_INVALID", {
			details: { flag, value },
		});
	}
	return value;
}

async function readJsonOrPath(value: string, repoRoot: string): Promise<unknown> {
	try {
		return JSON.parse(value);
	} catch {
		const { resolve } = await import("node:path");
		const { existsSync } = await import("node:fs");
		const { readFile } = await import("node:fs/promises");
		const path = resolve(repoRoot, value);
		if (existsSync(path)) {
			return JSON.parse(await readFile(path, "utf8"));
		}
		throw new Error(`Invalid JSON or unreadable file path: ${value}`);
	}
}

export async function dispatchConsensusCmd(repoRoot: string, argv: readonly string[], json: boolean): Promise<number> {
	const runId = required(argv, "--run-id");
	const fingerprint = readValue(argv, "--quality-input-fingerprint")?.trim();
	const live = argv.includes("--live");
	const mockLive = argv.includes("--mock-live");
	const prompt = readValue(argv, "--prompt")?.trim();
	const voterTimeoutStr = readValue(argv, "--voter-timeout-ms")?.trim();
	const voterTimeoutMs = voterTimeoutStr ? parseInt(voterTimeoutStr, 10) : undefined;
	const consensusTimeoutStr = readValue(argv, "--consensus-timeout-ms")?.trim();
	const consensusTimeoutMs = consensusTimeoutStr ? parseInt(consensusTimeoutStr, 10) : undefined;
	const opencodeBaseUrl = readValue(argv, "--opencode-base-url")?.trim();

	const result = await dispatchConsensus(repoRoot, runId, fingerprint, {
		live,
		mockLive,
		...(prompt !== undefined && { prompt }),
		...(voterTimeoutMs !== undefined && { voterTimeoutMs }),
		...(consensusTimeoutMs !== undefined && { consensusTimeoutMs }),
		...(opencodeBaseUrl !== undefined && { opencodeBaseUrl }),
	});
	if (json) printJson({ ok: true, ...result });
	else process.stdout.write(`Dispatched consensus ${result.consensusId} for run ${runId}.\n`);
	return 0;
}

export async function reportConsensusResultCmd(
	repoRoot: string,
	argv: readonly string[],
	json: boolean,
): Promise<number> {
	const runId = required(argv, "--run-id");
	const consensusId = required(argv, "--consensus-id");
	const agentId = required(argv, "--agent-id");
	const resultJsonStr = required(argv, "--result-json");
	const result = await readJsonOrPath(resultJsonStr, repoRoot);

	await reportConsensusResult(repoRoot, runId, consensusId, agentId, result);
	if (json) printJson({ ok: true, consensusId, agentId });
	else process.stdout.write(`Reported consensus result for agent ${agentId} in consensus ${consensusId}.\n`);
	return 0;
}

export async function aggregateConsensusCmd(repoRoot: string, argv: readonly string[], json: boolean): Promise<number> {
	const runId = required(argv, "--run-id");
	const consensusId = required(argv, "--consensus-id");
	const verdict = await aggregateConsensus(repoRoot, runId, consensusId);

	if (json) printJson({ ok: true, consensusId, verdict });
	else process.stdout.write(`Aggregated consensus ${consensusId}. Verdict: ${verdict}\n`);
	return 0;
}
