#!/usr/bin/env node
import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyLedger, fingerprint, makeRow, parseLedger } from "./lib/evidence-binding.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const format = "lazyantigravity-evidence-map.v1";
const product = "LazyAntigravity";
const allowedStatuses = new Set(["verified", "deferred", "removed"]);

const scannedFiles = [
	"README.md",
	"package.json",
	"skills/ulw-loop/SKILL.md",
	"skills/ulw-plan/SKILL.md",
	"components/telemetry/README.md",
	"components/telemetry/src/env-flags.ts",
	"components/telemetry/src/diagnostics.ts",
];

const commandClaims = [
	["readme.doctor-command", "npm run doctor -- --json", "doctor", "scripts/lazyantigravity-doctor.mjs"],
	["readme.hooks-report-command", "npm run hooks:report -- --json", "hooks:report", "scripts/lazyantigravity-hooks-report.mjs"],
	["readme.oss-icons-report-command", "npm run icons:report -- --json", "icons:report", "scripts/lazyantigravity-oss-icons-report.mjs"],
	["readme.mcp-status-command", "npm run mcp:status -- --json", "mcp:status", "scripts/lazyantigravity-mcp-status.mjs"],
	["readme.provenance-command", "npm run provenance -- --json", "provenance", "scripts/lazyantigravity-provenance.mjs"],
	["readme.evidence-map-command", "npm run evidence:map -- --json", "evidence:map", "scripts/lazyantigravity-evidence-map.mjs"],
];

const usage = [
	"Usage: node scripts/lazyantigravity-evidence-map.mjs [--json]",
	"       node scripts/lazyantigravity-evidence-map.mjs --fingerprint [--repo <dir>]",
	"       node scripts/lazyantigravity-evidence-map.mjs --check-ledger <ledger.jsonl> [--criteria C1,C2] [--repo <dir>]",
	"       node scripts/lazyantigravity-evidence-map.mjs --record <ledger.jsonl> --criterion <id> --verdict pass|fail|blocked --command <cmd> --evidence <text> [--artifact <path>]... [--repo <dir>]",
].join("\n");

async function main() {
	const argv = process.argv.slice(2);
	if (argv.some((arg) => ["--fingerprint", "--check-ledger", "--record"].includes(arg))) {
		process.exitCode = await runBinding(argv);
		return;
	}
	const options = parseArgs(argv);
	const report = await buildEvidenceMap();
	if (options.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		return;
	}
	process.stdout.write(toMarkdown(report));
}

export async function buildEvidenceMap(repoRoot = root) {
	const files = await readFiles(repoRoot, scannedFiles);
	const packageJson = JSON.parse(files.get("package.json"));
	const checkedCommandClaims = await Promise.all(commandClaims.map(([id, command, scriptName, scriptPath]) =>
		commandClaim({ id, command, scriptName, scriptPath, files, packageJson, repoRoot }),
	));
	const claims = [
		...checkedCommandClaims,
		autoUpdateClaim(files),
		telemetryOptOutClaim(files),
		telemetryDiagnosticsClaim(files),
		skillClaim(files, "skills.ulw-loop-evidence-loop", "skills/ulw-loop/SKILL.md", ["evidence", "Manual-QA"]),
		skillClaim(files, "skills.ulw-plan-grounding", "skills/ulw-plan/SKILL.md", ["Explore before asking", "approval"]),
		legacyClaimRemoved(files),
		quotaSkillDeferred(files),
	];
	const unknown = claims.filter((claim) => !allowedStatuses.has(claim.status)).map((claim) => claim.id);
	return {
		format,
		product,
		generated_at: new Date().toISOString(),
		scanned_files: scannedFiles,
		untrusted_text_policy: "README and skill files are read as inert text; this report never executes commands extracted from documentation.",
		summary: summarize(claims, unknown),
		claims,
	};
}

function parseArgs(args) {
	if (args.length === 0) return { json: false };
	if (args.length === 1 && args[0] === "--json") return { json: true };
	if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
		process.stdout.write(`${usage}\n`);
		process.exit(0);
	}
	throw new Error(usage);
}

function parseBindingArgs(args) {
	const valued = new Set(["--check-ledger", "--record", "--criteria", "--criterion", "--verdict", "--command", "--evidence", "--artifact", "--repo"]);
	const options = { artifacts: [] };
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--fingerprint") options.fingerprint = true;
		else if (valued.has(arg) && i + 1 < args.length) {
			const value = args[++i];
			if (arg === "--artifact") options.artifacts.push(value);
			else options[arg.slice(2).replace("check-ledger", "checkLedger")] = value;
		} else throw new Error(usage);
	}
	return options;
}

// Fingerprint-bound evidence (see skills/ulw-loop/references/evidence-binding.md). Returns the exit code.
async function runBinding(argv) {
	const options = parseBindingArgs(argv);
	const cwd = resolve(options.repo ?? process.cwd());
	const current = fingerprint(cwd);
	if (options.fingerprint) {
		process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
		return 0;
	}
	if (options.record) {
		const row = makeRow(options, current);
		const target = resolve(cwd, options.record);
		await mkdir(dirname(target), { recursive: true });
		await appendFile(target, `${JSON.stringify(row)}\n`);
		process.stdout.write(`${JSON.stringify(row)}\n`);
		return 0;
	}
	const rows = parseLedger(await readFile(resolve(cwd, options.checkLedger), "utf8"));
	const criteria = options.criteria ? options.criteria.split(",").filter(Boolean) : [];
	const verdict = classifyLedger(rows, current, { criteria, cwd });
	process.stdout.write(`${JSON.stringify({ tree: current.tree, diff_sha256: current.diff_sha256, ...verdict }, null, 2)}\n`);
	return verdict.ok ? 0 : 1;
}

async function readFiles(repoRoot, relativePaths) {
	const entries = await Promise.all(relativePaths.map(async (path) => [path, await readFile(join(repoRoot, path), "utf8")]));
	return new Map(entries);
}

async function exists(repoRoot, relativePath) {
	try {
		await access(join(repoRoot, relativePath));
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

async function commandClaim({ id, command, scriptName, scriptPath, files, packageJson, repoRoot }) {
	const readme = files.get("README.md");
	const scriptMatches = packageJson.scripts?.[scriptName]?.includes(scriptPath) === true;
	const scriptExists = await exists(repoRoot, scriptPath);
	const readmeMentions = readme.includes(command);
	return claim({
		id,
		source: "README.md",
		status: readmeMentions && scriptMatches && scriptExists ? "verified" : "deferred",
		evidence: [
			`README mentions ${command}: ${readmeMentions}`,
			`package.json script ${scriptName} targets ${scriptPath}: ${scriptMatches}`,
			`${scriptPath} exists: ${scriptExists}`,
		],
	});
}

function autoUpdateClaim(files) {
	const readme = files.get("README.md");
	const statusCommand = "node scripts/auto-update.mjs --status --json";
	return claim({
		id: "readme.auto-update-status-command",
		source: "README.md",
		status: "removed",
		evidence: [
			`README mentions ${statusCommand}: ${readme.includes(statusCommand)}`,
			"scripts/auto-update.mjs removed as dormant Codex-only code",
		],
	});
}

function telemetryOptOutClaim(files) {
	const readme = files.get("README.md");
	const envFlags = files.get("components/telemetry/src/env-flags.ts");
	const flags = [
		"OMO_DISABLE_POSTHOG",
		"OMO_SEND_ANONYMOUS_TELEMETRY",
		"OMO_CODEX_DISABLE_POSTHOG",
		"OMO_CODEX_SEND_ANONYMOUS_TELEMETRY",
	];
	const allDocumented = flags.every((flag) => readme.includes(flag));
	const allImplemented = flags.every((flag) => envFlags.includes(flag));
	return claim({
		id: "telemetry.opt-out-env",
		source: "README.md",
		status: allDocumented && allImplemented ? "verified" : "deferred",
		evidence: [`README documents all opt-out flags: ${allDocumented}`, `env-flags.ts implements all opt-out flags: ${allImplemented}`],
	});
}

function telemetryDiagnosticsClaim(files) {
	const readme = files.get("README.md");
	const diagnostics = files.get("components/telemetry/src/diagnostics.ts");
	const hasReadmePath = readme.includes("telemetry-diagnostics.jsonl");
	const hasLocalWriter = diagnostics.includes("writeTelemetryDiagnostic") && diagnostics.includes("appendFileSync");
	return claim({
		id: "telemetry.local-diagnostics",
		source: "README.md",
		status: hasReadmePath && hasLocalWriter ? "verified" : "deferred",
		evidence: [`README mentions telemetry-diagnostics.jsonl: ${hasReadmePath}`, `diagnostics.ts writes local JSONL: ${hasLocalWriter}`],
	});
}

function skillClaim(files, id, source, needles) {
	const content = files.get(source);
	const matches = needles.every((needle) => content.includes(needle));
	return claim({
		id,
		source,
		status: matches ? "verified" : "deferred",
		evidence: needles.map((needle) => `${source} contains ${JSON.stringify(needle)}: ${content.includes(needle)}`),
	});
}

function legacyClaimRemoved(files) {
	const readme = files.get("README.md");
	const legacyMarketing = ["ultrawork는 신입니다", "크레딧 및 토큰을 효율적으로 보존", "미래, OMO, LazyCodex"];
	const present = legacyMarketing.filter((phrase) => readme.includes(phrase));
	return claim({
		id: "readme.unsupported-legacy-marketing",
		source: "README.md",
		status: present.length === 0 ? "removed" : "deferred",
		evidence: present.length === 0 ? ["unsupported legacy marketing phrases are absent"] : present.map((phrase) => `still present: ${phrase}`),
	});
}

function quotaSkillDeferred(files) {
	const content = files.get("skills/ulw-loop/SKILL.md");
	const hasQuotaGuidance = /quota|rate limit|checkpoint/i.test(content);
	return claim({
		id: "skills.ulw-loop-quota-guidance",
		source: "skills/ulw-loop/SKILL.md",
		status: hasQuotaGuidance ? "deferred" : "removed",
		evidence: [hasQuotaGuidance ? "quota/checkpoint guidance remains skill guidance, not a README runtime claim" : "quota/checkpoint guidance is absent"],
	});
}

function claim({ id, source, status, evidence }) {
	return { id, source, status, evidence };
}

function summarize(claims, unknown) {
	const counts = Object.fromEntries([...allowedStatuses].map((status) => [status, claims.filter((claim) => claim.status === status).length]));
	return { total: claims.length, ...counts, unknown };
}

function toMarkdown(report) {
	const lines = [`# ${product} Evidence Map`, "", `Format: ${report.format}`, ""];
	for (const item of report.claims) {
		lines.push(`- ${item.status}: ${item.id} (${item.source})`);
	}
	return `${lines.join("\n")}\n`;
}

try {
	if (process.argv[1]?.endsWith("lazyantigravity-evidence-map.mjs")) {
		await main();
	}
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
