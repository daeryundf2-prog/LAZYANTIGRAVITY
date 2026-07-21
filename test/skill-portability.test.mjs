// allow: SIZE_OK - Todo 4 keeps the portability boundary contract cases in one node:test file for a single verifier command.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(root, "config", "antigravity-skills.json");
const modesPath = join(root, "config", "experimental-skill-modes.json");
const toolsPath = join(root, "config", "antigravity-tools.json");
const hashesPath = join(root, "config", "experimental-skill-hashes.json");
const linterPath = join(root, "scripts", "check-antigravity-skills.mjs");
const activeFixtureRoot = join(root, "test", "fixtures", "skill-portability", "active");

const coreNames = [
	"ast-grep", "debugging", "frontend-ui-ux", "git-master", "init-deep",
	"lsp", "lsp-setup", "programming", "review-work", "rules", "start-work",
	"ulw", "ulw-loop", "ulw-plan", "visual-qa",
];

const experimentalNames = [
	"browse", "clone", "coding-agent-sessions", "comment-checker", "deep-interview",
	"eval-loop", "hwp-loader", "lcx-contribute-bug-fix", "lcx-doctor",
	"lcx-report-bug", "refactor", "remove-ai-slops", "skill-gen", "sync-rules",
	"teammode", "ultimate-browsing", "ultraresearch", "ulw-research",
	"voice-interpreter",
];

const supportedTools = [
	"view_file", "write_to_file", "replace_file_content", "multi_replace_file_content",
	"list_dir", "find_by_name", "grep_search", "search_web", "read_url_content",
	"run_command", "manage_task", "schedule", "list_permissions", "ask_permission",
	"invoke_subagent", "define_subagent", "send_message", "manage_subagents",
	"ask_question", "generate_image",
];

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

function runLinter(args) {
	return spawnSync(process.execPath, [linterPath, ...args], {
		cwd: root,
		encoding: "utf8",
		windowsHide: true,
	});
}

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

async function writeSkill(skillsRoot, name, body, resources = {}) {
	const skillRoot = join(skillsRoot, name);
	await mkdir(skillRoot, { recursive: true });
	await writeFile(join(skillRoot, "SKILL.md"), body, "utf8");
	for (const [relativePath, content] of Object.entries(resources)) {
		const target = join(skillRoot, relativePath);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content, "utf8");
	}
}

const validSkill = (name) => `---\nname: ${name}\ndescription: Performs a portable verification task when requested.\n---\n\n# Portable skill\n\nUse [the local reference](references/guide.md).\n`;

test("[skills.contract.pinned] #given the vendored IDE skills contract #when hashed #then the pinned bytes match", async () => {
	const bytes = await readFile(join(root, "contracts", "antigravity", "skills.md"));
	assert.equal(sha256(bytes), "f9edcffbe1758127c68146b072022f597d63767e1cf9397fc6ae7475e7cdd705");
});

test("[skills.catalog.exact-boundary] #given support catalogs #when parsed #then 34 skills and 20 tools are exact", async () => {
	const [catalog, modes, tools] = await Promise.all([
		readJson(catalogPath), readJson(modesPath), readJson(toolsPath),
	]);
	assert.deepEqual(catalog.core.map(({ name }) => name), coreNames);
	assert.deepEqual(catalog.experimental.map(({ name }) => name), experimentalNames);
	const allNames = [...catalog.core, ...catalog.experimental].map(({ name }) => name);
	assert.equal(allNames.length, 34);
	assert.equal(new Set(allNames).size, 34);
	for (const entry of [...catalog.core, ...catalog.experimental]) {
		assert.equal(typeof entry.reason, "string");
		assert.notEqual(entry.reason.trim(), "");
		assert.deepEqual(Object.keys(entry).sort(), ["name", "reason"]);
	}
	assert.deepEqual(Object.keys(modes), experimentalNames);
	for (const mode of Object.values(modes)) {
		assert.deepEqual(mode, { ide: "unsupported", cli: "unsupported" });
	}
	assert.deepEqual(tools.tools, supportedTools);
	assert.equal(new Set(tools.tools).size, 20);
});

test("[skills.experimental.byte-preserved] #given the pre-edit hash lock #when current experimental trees are checked #then every byte is unchanged", () => {
	const result = runLinter([
		"--catalog", catalogPath,
		"--modes", modesPath,
		"--tools", toolsPath,
		"--hashes", hashesPath,
	]);
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	const report = JSON.parse(result.stdout);
	assert.equal(report.status, "passed");
	assert.equal(report.experimentalHashCount, 19);
	assert.deepEqual(report.violations, []);
});

test("[skills.linter.malformed-before-repair] #given five malformed approved candidates #when repaired #then each changes from fail to pass", async (t) => {
	const tempRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-task4-malformed-"));
	t.after(() => rm(tempRoot, { recursive: true, force: true }));
	const cases = [
		{
			name: "ast-grep",
			code: "skill-description",
			body: "---\nname: ast-grep\n---\n\n# Missing description\n",
		},
		{
			name: "debugging",
			code: "skill-name",
			body: "---\nname: wrong-name\ndescription: Performs debugging when requested.\n---\n",
		},
		{
			name: "git-master",
			code: "missing-reference",
			body: "---\nname: git-master\ndescription: Performs Git checks when requested.\n---\n\n[missing](references/missing.md)\n",
		},
		{
			name: "init-deep",
			code: "reference-escape",
			body: "---\nname: init-deep\ndescription: Builds repository guidance when requested.\n---\n\n[escape](../outside.md)\n",
		},
		{
			name: "lsp",
			code: "forbidden-surface",
			body: "---\nname: lsp\ndescription: Checks language diagnostics when requested.\n---\n\n# Diagnostics\n\nUse `codex_app.create_thread` here.\n",
		},
	];

	for (const candidate of cases) {
		const skillsRoot = join(tempRoot, candidate.name);
		await writeSkill(skillsRoot, candidate.name, candidate.body);
		const red = runLinter([
			"--catalog", catalogPath, "--modes", modesPath, "--tools", toolsPath,
			"--hashes", hashesPath, "--skills-root", skillsRoot, "--skill", candidate.name,
		]);
		assert.notEqual(red.status, 0, `${candidate.name} unexpectedly passed`);
		assert.match(`${red.stdout}\n${red.stderr}`, new RegExp(candidate.code));

		await writeSkill(skillsRoot, candidate.name, validSkill(candidate.name), {
			"references/guide.md": "# Local guide\n",
		});
		const green = runLinter([
			"--catalog", catalogPath, "--modes", modesPath, "--tools", toolsPath,
			"--hashes", hashesPath, "--skills-root", skillsRoot, "--skill", candidate.name,
		]);
		assert.equal(green.status, 0, `${green.stdout}\n${green.stderr}`);
	}
});

test("[skills.linter.forbidden-file-line] #given a forbidden nested surface #when linted #then the exact file and line are reported", async (t) => {
	const tempRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-task4-line-"));
	t.after(() => rm(tempRoot, { recursive: true, force: true }));
	const body = "---\nname: ast-grep\ndescription: Performs portable searches when requested.\n---\n\n# Search\n\nUse `codex_app.create_thread` here.\n";
	await writeSkill(tempRoot, "ast-grep", body);
	const result = runLinter([
		"--catalog", catalogPath, "--modes", modesPath, "--tools", toolsPath,
		"--hashes", hashesPath, "--skills-root", tempRoot, "--skill", "ast-grep",
	]);
	assert.notEqual(result.status, 0);
	const report = JSON.parse(result.stdout);
	const violation = report.violations.find(({ code }) => code === "forbidden-surface");
	assert.ok(violation);
	assert.match(violation.location, /ast-grep\/SKILL\.md:8$/);
});

test("[skills.linter.windows-reference-containment] #given Windows and mixed-separator escapes #when linted #then every path is rejected at its exact line", async (t) => {
	const tempRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-task4-windows-path-"));
	t.after(() => rm(tempRoot, { recursive: true, force: true }));
	const cases = [
		{ label: "drive-absolute", target: String.raw`C:\Windows\win.ini` },
		{ label: "unc-absolute", target: String.raw`\\server\share\file.md` },
		{ label: "backslash-traversal", target: String.raw`..\..\outside.md` },
		{ label: "mixed-separator-traversal", target: String.raw`references/..\..\outside.md` },
		{ label: "file-url-absolute", target: "file:///C:/Windows/win.ini" },
	];

	for (const candidate of cases) {
		const body = `---\nname: ast-grep\ndescription: Checks ${candidate.label} references when requested.\n---\n\n# References\n\n[escape](${candidate.target})\n`;
		await writeSkill(tempRoot, "ast-grep", body);
		const result = runLinter([
			"--catalog", catalogPath, "--modes", modesPath, "--tools", toolsPath,
			"--hashes", hashesPath, "--skills-root", tempRoot, "--skill", "ast-grep",
		]);
		assert.notEqual(result.status, 0, `${candidate.label} unexpectedly passed`);
		const report = JSON.parse(result.stdout);
		const violations = report.violations.filter(({ code }) => code === "reference-escape");
		assert.deepEqual(violations.map(({ location }) => location), ["ast-grep/SKILL.md:8"], candidate.label);
	}
});

test("[skills.linter.tool-catalog-enforced] #given recursive explicit tool references #when linted #then only the exact Antigravity catalog is accepted", async (t) => {
	const tempRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-task4-tools-"));
	t.after(() => rm(tempRoot, { recursive: true, force: true }));
	const unsupported = ["exec_command", "apply_patch", "web__run", "request_user_input", "update_plan"];
	const nestedBody = unsupported.map((tool, index) => `${index + 1}. Use the \`${tool}\` tool.`).join("\n") + "\n";
	await writeSkill(tempRoot, "ast-grep", validSkill("ast-grep"), {
		"references/guide.md": "# Local guide\n",
		"references/tools.md": nestedBody,
	});

	const rejected = runLinter([
		"--catalog", catalogPath, "--modes", modesPath, "--tools", toolsPath,
		"--hashes", hashesPath, "--skills-root", tempRoot, "--skill", "ast-grep",
	]);
	assert.notEqual(rejected.status, 0, "non-Antigravity tools unexpectedly passed");
	const report = JSON.parse(rejected.stdout);
	assert.deepEqual(
		report.violations.filter(({ code }) => code === "unsupported-tool").map(({ location }) => location),
		unsupported.map((_, index) => `ast-grep/references/tools.md:${index + 1}`),
	);

	const supportedBody = supportedTools.map((tool) => `Use the \`${tool}\` tool.`).join("\n") + "\n";
	await writeSkill(tempRoot, "ast-grep", validSkill("ast-grep"), {
		"references/guide.md": "# Local guide\n",
		"references/tools.md": supportedBody,
	});
	const accepted = runLinter([
		"--catalog", catalogPath, "--modes", modesPath, "--tools", toolsPath,
		"--hashes", hashesPath, "--skills-root", tempRoot, "--skill", "ast-grep",
	]);
	assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
});

test("[skills.linter.json-active-subject] #given the exact catalog json command #when a portable active fixture is selected #then stdout equals the file and activeSkillsChecked is nonzero", async (t) => {
	const tempRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-task4-json-active-"));
	t.after(() => rm(tempRoot, { recursive: true, force: true }));
	const outputPath = join(tempRoot, "report.json");

	const result = runLinter([
		"--catalog", catalogPath,
		"--modes", modesPath,
		"--tools", toolsPath,
		"--hashes", hashesPath,
		"--skills-root", activeFixtureRoot,
		"--skill", "ast-grep",
		"--json", outputPath,
	]);

	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	assert.equal(result.stdout, await readFile(outputPath, "utf8"));
	const report = JSON.parse(result.stdout);
	assert.deepEqual(report.activeSkillsChecked, ["ast-grep"]);
	assert.equal(report.status, "passed");
});

test("[skills.linter.json-no-active-fails-closed] #given json output without an active subject #when the exact catalog is checked #then the command fails closed", async (t) => {
	const tempRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-task4-json-no-active-"));
	t.after(() => rm(tempRoot, { recursive: true, force: true }));
	const outputPath = join(tempRoot, "report.json");

	const result = runLinter(["--catalog", catalogPath, "--json", outputPath]);

	assert.notEqual(result.status, 0);
	const report = JSON.parse(result.stdout);
	assert.equal(report.status, "failed");
	assert.deepEqual(report.violations.map(({ code }) => code), ["active-selection"]);
	assert.equal(result.stdout, await readFile(outputPath, "utf8"));
});

test("[skills.linter.json-write-failure] #given json output points at an existing directory #when the report is emitted #then stderr is bounded and stdout is structured JSON", async (t) => {
	const tempRoot = await mkdtemp(join(tmpdir(), "lazyantigravity-task4-json-write-"));
	t.after(() => rm(tempRoot, { recursive: true, force: true }));
	const directoryTarget = join(tempRoot, "directory-target");
	await mkdir(directoryTarget);

	const result = runLinter([
		"--catalog", catalogPath,
		"--modes", modesPath,
		"--tools", toolsPath,
		"--hashes", hashesPath,
		"--skills-root", activeFixtureRoot,
		"--skill", "ast-grep",
		"--json", directoryTarget,
	]);

	assert.notEqual(result.status, 0);
	assert.doesNotMatch(result.stderr, /Node\.js|at async|internal\/fs|node:internal/);
	assert.ok(result.stderr.length <= 2048);
	const report = JSON.parse(result.stdout);
	assert.equal(report.status, "failed");
	assert.deepEqual(report.violations.map(({ code }) => code), ["json-write"]);
});
