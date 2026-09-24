import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeAntigravityPayload } from "./antigravity-hook-adapter.mjs";
import { validateToolInvocation } from "../components/git-bash/dist/tool-policy.js";
import { formatActiveMemoryContext } from "../components/memory/dist/store.js";
import { validateStrictEvidence } from "../components/ulw-loop/dist/evidence-contract.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let baselineRef = "HEAD";
let updateReadme = false;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--update-readme") updateReadme = true;
	else if (args[i] === "--baseline-ref" && args[i + 1]) baselineRef = args[++i];
	else throw new Error("Usage: bench-hook-paths.mjs [--baseline-ref REF] [--update-readme]");
}
function git(arguments_) {
	const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 });
	if (result.status !== 0) throw new Error(result.stderr || "Baseline unavailable");
	return result.stdout;
}
const baselineCommit = git(["rev-parse", "--verify", "--end-of-options", `${baselineRef}^{commit}`]).trim();
const baselineFiles = {};
// 베이스라인 모듈은 형제 import를 해석해야 하므로 data: URL 대신
// detached worktree의 실제 경로에서 로드한다(dist/는 커밋 산출물).
const baselineWorktree = mkdtempSync(join(tmpdir(), "bench-baseline-"));
try {
	git(["worktree", "add", "--detach", baselineWorktree, baselineCommit]);
} catch {
	rmSync(baselineWorktree, { recursive: true, force: true });
	throw new Error(`Cannot create baseline worktree at ${baselineCommit.slice(0, 7)}`);
}
async function baseline(path, name) {
	const source = git(["show", `${baselineCommit}:${path}`]);
	baselineFiles[path] = createHash("sha256").update(source).digest("hex");
	try {
		const module = await import(pathToFileURL(join(baselineWorktree, path)).href);
		if (typeof module[name] !== "function") throw new Error(`Missing export ${name}`);
		return module[name];
	} catch (error) {
		throw new Error(`Cannot load baseline ${path}: ${error.message}`);
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
try {
	git(["worktree", "remove", "--force", baselineWorktree]);
} catch {
	rmSync(baselineWorktree, { recursive: true, force: true });
}
if (sink === undefined) throw new Error("Benchmark produced no result");
const scope = "Warm in-process synthetic function comparison, alternating batch order. Includes loop/timer overhead; percentiles describe batch means, not individual calls. No host, cold startup, network, daemon, filesystem operation, or subprocess latency measured. Different outputs are not equivalent-work speedups. No performance threshold or improvement claim.";
console.log(JSON.stringify({ node: process.version, platform: process.platform, baselineCommit, baselineFiles, warmupCallsPerVariant: warmup, batchesPerVariant: batches, callsPerBatch, scope, results }, null, 2));

if (updateReadme) {
	const { readFileSync, writeFileSync } = await import("node:fs");
	const { join } = await import("node:path");
	const START = "<!-- BENCH_HOOKS:START -->";
	const END = "<!-- BENCH_HOOKS:END -->";
	const fmt = (v) => (v * 1000).toFixed(1);
	const rows = Object.entries(results).map(([name, r]) =>
		`| \`${name}\` | ${fmt(r.current.p50BatchMeanMsPerCall)} | ${fmt(r.current.p95BatchMeanMsPerCall)} | ${fmt(r.baseline.p50BatchMeanMsPerCall)} |`,
	);
	const block = [
		START,
		"",
		`Measured ${new Date().toISOString().slice(0, 10)} on Node ${process.version} (${process.platform}), baseline ${baselineCommit.slice(0, 7)}. Values are µs/call batch means.`,
		"",
		"| Hook path | p50 current | p95 current | p50 baseline |",
		"|---|---|---|---|",
		...rows,
		"",
		`_${scope}_`,
		"",
		END,
	].join("\n");
	const readmePath = join(root, "README.md");
	const readme = readFileSync(readmePath, "utf8");
	const start = readme.indexOf(START);
	const end = readme.indexOf(END);
	if (start === -1 || end === -1 || end < start) {
		throw new Error(`README.md missing ${START}..${END} marker block`);
	}
	writeFileSync(readmePath, `${readme.slice(0, start)}${block}${readme.slice(end + END.length)}`);
	console.error(`README.md benchmark block updated (${Object.keys(results).length} paths)`);
}
