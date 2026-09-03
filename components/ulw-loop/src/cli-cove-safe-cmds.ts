import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasFlag, readValue } from "./cli-arg-parser.js";
import { UlwLoopError } from "./types.js";

function getPluginRoot(repoRoot: string): string {
	const candidates = [
		repoRoot,
		resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."),
		resolve(dirname(fileURLToPath(import.meta.url)), ".."),
	];
	for (const cand of candidates) {
		if (existsSync(join(cand, "scripts", "cove_verify.mjs"))) return cand;
	}
	return repoRoot;
}

export async function coveVerifyCmd(
	repoRoot: string,
	argv: readonly string[],
	json: boolean,
): Promise<number> {
	if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
		process.stdout.write("Usage: ulw-loop cove-verify <draft_file.md> [--file <path>] [--kb <ref.txt>] [--strict] [--json] [--output <out.md>]\n");
		return 0;
	}
	const file = readValue(argv, "--file") || argv.find((a) => !a.startsWith("-"));
	if (!file) {
		throw new UlwLoopError("Missing draft file argument (or --file <path>)", "ULW_LOOP_ARGUMENT_MISSING");
	}
	const fullPath = resolve(repoRoot, file);
	if (!existsSync(fullPath)) {
		throw new UlwLoopError(`File not found: ${fullPath}`, "ULW_LOOP_FILE_NOT_FOUND");
	}

	const pluginRoot = getPluginRoot(repoRoot);
	const scriptPath = join(pluginRoot, "scripts", "cove_verify.mjs");

	const childArgs = [scriptPath, fullPath];
	const kb = readValue(argv, "--kb");
	if (kb) childArgs.push("--kb", resolve(repoRoot, kb));
	if (hasFlag(argv, "--strict")) childArgs.push("--strict");
	if (json || hasFlag(argv, "--json")) childArgs.push("--json");
	const output = readValue(argv, "--output");
	if (output) childArgs.push("--output", resolve(repoRoot, output));

	const res = spawnSync(process.execPath, childArgs, {
		cwd: repoRoot,
		encoding: "utf-8",
		windowsHide: true,
	});

	if (res.stdout) process.stdout.write(res.stdout);
	if (res.stderr) process.stderr.write(res.stderr);

	return res.status ?? (res.error ? 1 : 0);
}

export async function safeEvalCmd(
	repoRoot: string,
	argv: readonly string[],
	json: boolean,
): Promise<number> {
	if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
		process.stdout.write("Usage: ulw-loop safe-eval <file.md> [--file <path>] [--kb <reference.txt>] [--strict] [--json]\n");
		return 0;
	}
	const file = readValue(argv, "--file") || argv.find((a) => !a.startsWith("-"));
	if (!file) {
		throw new UlwLoopError("Missing file argument (or --file <path>)", "ULW_LOOP_ARGUMENT_MISSING");
	}
	const fullPath = resolve(repoRoot, file);
	if (!existsSync(fullPath)) {
		throw new UlwLoopError(`File not found: ${fullPath}`, "ULW_LOOP_FILE_NOT_FOUND");
	}

	const pluginRoot = getPluginRoot(repoRoot);
	const scriptPath = join(pluginRoot, "scripts", "safe_evaluator.mjs");

	const childArgs = [scriptPath, fullPath];
	const kb = readValue(argv, "--kb");
	if (kb) childArgs.push("--kb", resolve(repoRoot, kb));
	if (hasFlag(argv, "--strict")) childArgs.push("--strict");
	if (json || hasFlag(argv, "--json")) childArgs.push("--json");

	const res = spawnSync(process.execPath, childArgs, {
		cwd: repoRoot,
		encoding: "utf-8",
		windowsHide: true,
	});

	if (res.stdout) process.stdout.write(res.stdout);
	if (res.stderr) process.stderr.write(res.stderr);

	return res.status ?? (res.error ? 1 : 0);
}
