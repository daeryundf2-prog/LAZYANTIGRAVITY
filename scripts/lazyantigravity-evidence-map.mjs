#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
	"scripts/auto-update.mjs",
];

const commandClaims = [
	["readme.doctor-command", "npm run doctor -- --json", "doctor", "scripts/lazyantigravity-doctor.mjs"],
	["readme.hooks-report-command", "npm run hooks:report -- --json", "hooks:report", "scripts/lazyantigravity-hooks-report.mjs"],
	["readme.oss-icons-report-command", "npm run icons:report -- --json", "icons:report", "scripts/lazyantigravity-oss-icons-report.mjs"],
	["readme.mcp-status-command", "npm run mcp:status -- --json", "mcp:status", "scripts/lazyantigravity-mcp-status.mjs"],
	["readme.provenance-command", "npm run provenance -- --json", "provenance", "scripts/lazyantigravity-provenance.mjs"],
	["readme.evidence-map-command", "npm run evidence:map -- --json", "evidence:map", "scripts/lazyantigravity-evidence-map.mjs"],
];

async function main() {
	const options = parseArgs(process.argv.slice(2));
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
		await autoUpdateClaim(files, repoRoot),
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
		process.stdout.write("Usage: node scripts/lazyantigravity-evidence-map.mjs [--json]\n");
		process.exit(0);
	}
	throw new Error("Usage: node scripts/lazyantigravity-evidence-map.mjs [--json]");
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

async function autoUpdateClaim(files, repoRoot) {
	const readme = files.get("README.md");
	const source = files.get("scripts/auto-update.mjs");
	const statusCommand = "node scripts/auto-update.mjs --status --json";
	const scriptExists = await exists(repoRoot, "scripts/auto-update.mjs");
	const sourceSupportsStatus = source.includes("resolveAutoUpdateStatus") && source.includes("mutating: false");
	return claim({
		id: "readme.auto-update-status-command",
		source: "README.md",
		status: readme.includes(statusCommand) && scriptExists && sourceSupportsStatus ? "verified" : "deferred",
		evidence: [
			`README mentions ${statusCommand}: ${readme.includes(statusCommand)}`,
			"auto-update status source reports mutating:false: " + sourceSupportsStatus,
			`scripts/auto-update.mjs exists: ${scriptExists}`,
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
