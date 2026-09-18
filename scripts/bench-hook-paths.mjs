import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { normalizeAntigravityPayload } from "./antigravity-hook-adapter.mjs";
import { validateToolInvocation } from "../components/git-bash/dist/tool-policy.js";
import { formatActiveMemoryContext } from "../components/memory/dist/store.js";
import { validateStrictEvidence } from "../components/ulw-loop/dist/evidence-contract.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--baseline-ref")) throw new Error("Usage: bench-hook-paths.mjs [--baseline-ref REF]");
function git(arguments_) {
	const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 });
	if (result.status !== 0) throw new Error(result.stderr || "Baseline unavailable");
	return result.stdout;
}
const baselineCommit = git(["rev-parse", "--verify", "--end-of-options", `${args[1] ?? "HEAD"}^{commit}`]).trim();
const baselineFiles = {};
async function baseline(path, name) {
	const source = git(["show", `${baselineCommit}:${path}`]);
	baselineFiles[path] = createHash("sha256").update(source).digest("hex");
	try {
		const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
		if (typeof module[name] !== "function") throw new Error(`Missing export ${name}`);
		return module[name];
	} catch (error) {
		throw new Error(`Cannot load self-contained baseline ${path}: ${error.message}`);
	}
}
const cases = [
	["payloadNormalization", "scripts/antigravity-hook-adapter.mjs", "normalizeAntigravityPayload", normalizeAntigravityPayload,
		[{ eventName: "PreToolUse", tool: { name: "shell", args: { command: "git status" } } }]],
	["shellPermissionPolicy", "components/git-bash/dist/tool-policy.js", "validateToolInvocation", validateToolInvocation,
		["Bash", { command: "git status" }]],
	["workingMemoryFormatting", "components/memory/dist/store.js", "formatActiveMemoryContext", formatActiveMemoryContext,
		[[{ id: "fixture", timestamp: 0, category: "fact", content: "Synthetic working fact" }]]],
	["evidenceContractValidation", "components/ulw-loop/dist/evidence-contract.js", "validateStrictEvidence", validateStrictEvidence,
		[{ status: "not_checked", summary: "Synthetic benchmark draft", unknowns: ["Execution not checked"] }]],
];
const warmup = 1000;
const batches = 100;
const callsPerBatch = 100;
let sink;
function measure(operation, input) {
	const start = performance.now();
	for (let i = 0; i < callsPerBatch; i++) sink = operation(...input);
	return (performance.now() - start) / callsPerBatch;
}
function summary(samples) {
	samples.sort((a, b) => a - b);
	return { p50BatchMeanMsPerCall: samples[Math.floor(samples.length * 0.5)], p95BatchMeanMsPerCall: samples[Math.floor(samples.length * 0.95)] };
}
const results = {};
for (const [name, path, exported, current, input] of cases) {
	const previous = await baseline(path, exported);
	const outputsEqual = isDeepStrictEqual(previous(...input), current(...input));
	for (let i = 0; i < warmup; i++) { sink = previous(...input); sink = current(...input); }
	const before = [];
	const after = [];
	for (let i = 0; i < batches; i++) {
		if (i % 2 === 0) { before.push(measure(previous, input)); after.push(measure(current, input)); }
		else { after.push(measure(current, input)); before.push(measure(previous, input)); }
	}
	results[name] = { identicalInputs: true, outputsEqual, baseline: summary(before), current: summary(after) };
}
if (sink === undefined) throw new Error("Benchmark produced no result");
console.log(JSON.stringify({ node: process.version, platform: process.platform, baselineCommit, baselineFiles, warmupCallsPerVariant: warmup, batchesPerVariant: batches, callsPerBatch, scope: "Warm in-process synthetic function comparison, alternating batch order. Includes loop/timer overhead; percentiles describe batch means, not individual calls. No host, cold startup, network, daemon, filesystem operation, or subprocess latency measured. Different outputs are not equivalent-work speedups. No performance threshold or improvement claim.", results }, null, 2));
