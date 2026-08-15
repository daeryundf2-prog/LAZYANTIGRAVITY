import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sharedSkillsRootPath } from "@lazyantigravity/shared-skills";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(root, "..", "..", "..");
const CONTEXT_PRESSURE_SKILL_BUDGET_BYTES = 25_000;

const expectedSkills = [
	"active-memory",
	"adaptive-reasoning",
	"arch-guard",
	"ast-refactor",
	"comment-checker",
	"debugging",
	"dual-verify",
	"flaky-guard",
	"frontend-ui-ux",
	"git-master",
	"hypothesis-tree",
	"image-prompt",
	"information-density",
	"init-deep",
	"lcx-report-bug",
	"lsp",
	"programming",
	"refactor",
	"remove-ai-slops",
	"repo-survey",
	"report-bug",
	"review-work",
	"rules",
	"session-persistence",
	"start-work",
	"swarm-sync",
	"ui-loopback",
	"ulw",
	"ulw-loop",
	"ulw-plan",
	"visual-qa",
];

const componentSkillSources = [
	["comment-checker", "components/comment-checker/skills/comment-checker"],
	["lsp", "components/lsp/skills/lsp"],
	["rules", "components/rules/skills/rules"],
	["ulw-loop", "components/ulw-loop/skills/ulw-loop"],
	["ulw-plan", "components/ultrawork/skills/ulw-plan"],
];

const codexCompatibilityEndMarkers = [
	"For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long passes and `BLOCKED: <reason>` only when progress stops. A `wait_agent` timeout only means no new mailbox update arrived. Treat a running child or latest `WORKING:` message as alive. Do not use `list_agents` as a polling loop. Fallback only when the child is completed without the deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running.\n\n",
	"Codex full-history forks inherit the parent agent type, model, and reasoning effort, so role-specific spawns with `agent_type` must use a non-full-history fork mode such as `fork_turns=\"none\"`. Include any required conversation context, files, diffs, constraints, and requested skill names directly in the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
	"When translating `load_skills=[...]`, include the requested skill names in the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
	"When translating `load_skills=[...]`, name the skills inside the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
];

function removeCodexCompatibilityGuidance(content) {
	const start = content.indexOf("## Codex Harness Tool Compatibility\n\n");
	if (start === -1) return content;
	const endMarker = codexCompatibilityEndMarkers
		.filter((marker) => content.indexOf(marker, start) !== -1)
		.sort((left, right) => content.indexOf(right, start) - content.indexOf(left, start))[0];
	assert.notEqual(endMarker, undefined, "Codex compatibility guidance block is missing its terminator");
	const end = content.indexOf(endMarker, start);
	assert.notEqual(end, -1, "Codex compatibility guidance block is missing its terminator");
	return `${content.slice(0, start)}${content.slice(end + endMarker.length)}`;
}

async function listSkillFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			const nested = await listSkillFiles(join(dir, entry.name));
			for (const nestedPath of nested) files.push(join(entry.name, nestedPath));
		} else {
			files.push(entry.name);
		}
	}
	return files.sort();
}

async function readPackagedSkillFile(...segments) {
	const path = join(root, "skills", ...segments);
	const content = await readFile(path, "utf8");
	return { path, content };
}

function assertPackagedContentMatches({ path, content }, requirements) {
	for (const [label, pattern] of requirements) {
		assert.match(content, pattern, `${path} missing packaged skill contract: ${label}`);
	}
}

test("#given synced aggregate Codex skills #when inspected #then component and shared skills are present", async () => {
	// given
	const skillsRoot = join(root, "skills");

	// when
	const skillNames = (await readdir(skillsRoot, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory() && entry.name !== "references")
		.map((entry) => entry.name)
		.sort();

	// then
	assert.deepEqual(skillNames, expectedSkills);
	for (const skillName of expectedSkills) {
		const content = await readFile(join(skillsRoot, skillName, "SKILL.md"), "utf8");
		assert.match(removeCodexCompatibilityGuidance(content), /^---\r?\n/);
	}
});

test("#given aggregate Codex skills #when source wiring is inspected #then shared skills are imported from the shared-skills package", async () => {
	// given
	const pluginPackageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
	const sharedPackageJson = JSON.parse(await readFile(join(sharedSkillsRootPath(), "..", "package.json"), "utf8"));
	const rootPackageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
	const syncScript = await readFile(join(root, "scripts", "sync-skills.mjs"), "utf8");
	const syncSkillsModule = await readFile(join(root, "src", "packages", "sync-skills", "index.mjs"), "utf8");

	// when
	const sharedSkillDependency = pluginPackageJson.dependencies?.["@lazyantigravity/shared-skills"];
	const syncSkillsDependency = pluginPackageJson.dependencies?.["@lazyantigravity/sync-skills"];
	const rootPackageFiles = rootPackageJson.files ?? [];

	// then
	assert.equal(sharedPackageJson.exports?.["."], "./index.mjs");
	assert.equal(sharedPackageJson.files?.includes("skills"), true);
	assert.equal(rootPackageFiles.includes("shared-skills/package.json"), true);
	assert.equal(rootPackageFiles.includes("shared-skills/index.mjs"), true);
	assert.equal(rootPackageFiles.includes("shared-skills/skills"), true);
	assert.equal(sharedSkillDependency, "file:./shared-skills");
	assert.equal(syncSkillsDependency, "file:./src/packages/sync-skills");
	assert.match(syncScript, /from "@lazyantigravity\/sync-skills"/);
	assert.match(syncSkillsModule, /from "@lazyantigravity\/shared-skills"/);
	assert.doesNotMatch(syncScript, /shared-skills",\s*"skills"/);
});

test("#given npm pack command #when pack dry-run is run #then the pack files include materialized shared-skills assets", async () => {
	const { execSync } = await import("node:child_process");
	const output = execSync("npm pack --dry-run --json", { cwd: root, encoding: "utf8" });
	const parsed = JSON.parse(output);
	const files = parsed[0].files.map((f) => f.path);

	assert.equal(parsed[0].entryCount > 100, true);
	assert.equal(files.includes("shared-skills/package.json"), true);
	assert.equal(files.includes("shared-skills/index.mjs"), true);
	assert.equal(files.includes("shared-skills/skills/programming/SKILL.md"), true);
});

test("#given shared skill package source #when aggregate Codex shared skills are inspected #then generated copies have no hand-authored drift", async () => {
	// given
	const sharedSkillsRoot = sharedSkillsRootPath();
	const aggregateSkillsRoot = join(root, "skills");
	const sharedSkillNames = (await readdir(sharedSkillsRoot, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	// when / then
	for (const skillName of sharedSkillNames) {
		const sharedContent = await readFile(join(sharedSkillsRoot, skillName, "SKILL.md"), "utf8");
		const aggregateContent = await readFile(join(aggregateSkillsRoot, skillName, "SKILL.md"), "utf8");
		assert.equal(
			removeCodexCompatibilityGuidance(aggregateContent),
			removeCodexCompatibilityGuidance(sharedContent),
			`${skillName} drifted from shared-skills`,
		);
	}
});

test("#given component skill sources #when aggregate Codex component skills are inspected #then generated copies have no hand-authored drift", async () => {
	// given
	const aggregateSkillsRoot = join(root, "skills");

	// when / then
	for (const [skillName, sourcePath] of componentSkillSources) {
		const sourceDir = join(root, sourcePath);
		const aggregateDir = join(aggregateSkillsRoot, skillName);
		const sourceFiles = await listSkillFiles(sourceDir);
		const aggregateFiles = await listSkillFiles(aggregateDir);
		assert.deepEqual(aggregateFiles, sourceFiles, `${skillName} resource set drifted from its component skill source`);
		for (const relativePath of sourceFiles) {
			const sourceContent = await readFile(join(sourceDir, relativePath), "utf8");
			const aggregateContent = await readFile(join(aggregateDir, relativePath), "utf8");
			assert.equal(
				removeCodexCompatibilityGuidance(aggregateContent),
				removeCodexCompatibilityGuidance(sourceContent),
				`${skillName}/${relativePath} drifted from its component skill source`,
			);
		}
	}
});

test("#given synced ulw-loop skill #when Codex hint metadata is inspected #then ulw-loop surfaces the ulw-loop alias", async () => {
	// given
	const skillRoot = join(root, "skills", "ulw-loop");

	// when
	const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
	const interfaceMetadata = await readFile(join(skillRoot, "agents", "openai.yaml"), "utf8");

	// then
	assert.match(skill, /^---\r?\nname: ulw-loop\r?\n/m);
	assert.match(skill, /Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps\./);
	assert.match(interfaceMetadata, /display_name: "ulw-loop \(omo\)"/);
	assert.doesNotMatch(interfaceMetadata, /ulw-loop \/ ulw-loop/);
	assert.match(interfaceMetadata, /short_description: "Goal-like ultrawork loop for systematic decomposition"/);
	assert.match(interfaceMetadata, /default_prompt: "Use \$ulw-loop/);
});

test("#given synced ulw-loop skill #when Codex hint metadata is inspected #then ulw-loop remains discoverable as an alias", async () => {
	// given
	const skillRoot = join(root, "skills", "ulw-loop");

	// when
	const interfaceMetadata = await readFile(join(skillRoot, "agents", "openai.yaml"), "utf8");

	// then
	assert.match(interfaceMetadata, /search_terms:/);
	assert.match(interfaceMetadata, /- "ulw-loop"/);
});

test("#given synced report-bug skill #when inspected #then it files LazyAntigravity bug issues from proven debugging evidence", async () => {
	// given
	const skillRoot = join(root, "skills", "report-bug");

	// when
	const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
	const interfaceMetadata = await readFile(join(skillRoot, "agents", "openai.yaml"), "utf8");

	// then
	assert.match(skill, /^---\r?\nname: report-bug\r?\n/m);
	assert.match(skill, /daeryundf2-prog\/LAZYANTIGRAVITY/);
	assert.match(skill, /\/tmp\/lazyantigravity-source/);
	assert.match(skill, /\$omo:debugging/);
	assert.match(skill, /Repository Decision/);
	assert.match(skill, /TARGET_REPO="daeryundf2-prog\/LAZYANTIGRAVITY"/);
	assert.match(skill, /gh issue create --repo "\$TARGET_REPO"/);
	assert.match(skill, /gh pr create --repo "\$TARGET_REPO"/);
	assert.match(skill, /🤖 This issue\/PR was debugged and created with \[LazyAntigravity\]/);
	assert.match(skill, /Browser use fallback/);
	assert.match(skill, /Computer use fallback/);
	assert.match(skill, /## Issue Body Template/);
	assert.match(interfaceMetadata, /display_name: "report-bug \(lazyantigravity\)"/);
	assert.match(interfaceMetadata, /- "lazyantigravity bug"/);
	assert.match(interfaceMetadata, /- "antigravity plugin bug"/);
});

test("#given synced lcx-report-bug skill #when inspected #then it is an alias of report-bug", async () => {
	// given
	const skillRoot = join(root, "skills", "lcx-report-bug");

	// when
	const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
	const interfaceMetadata = await readFile(join(skillRoot, "agents", "openai.yaml"), "utf8");

	// then
	assert.match(skill, /^---\r?\nname: lcx-report-bug\r?\n/m);
	assert.match(skill, /thin alias for `report-bug`/);
	assert.match(skill, /\.\.\/report-bug\/SKILL\.md/);
	assert.match(interfaceMetadata, /display_name: "lcx-report-bug \(alias\)"/);
	assert.match(interfaceMetadata, /- "lcx-report-bug"/);
});

test("#given synced git-master skill #when inspected #then commits and git history route through it", async () => {
	// given
	const skillRoot = join(root, "skills", "git-master");

	// when
	const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
	const interfaceMetadata = await readFile(join(skillRoot, "agents", "openai.yaml"), "utf8");

	// then
	assert.match(skill, /^---\r?\nname: git-master\r?\n/m);
	assert.match(skill, /MUST USE whenever a task needs a commit or git-history investigation/);
	assert.match(skill, /Commit only the user's requested changes/);
	assert.match(skill, /Choose the Git tool by the question/);
	assert.match(skill, /git log -S "text"/);
	assert.match(skill, /git blame -L start,end -- file/);
	assert.match(interfaceMetadata, /display_name: "git-master \(omo\)"/);
	assert.match(interfaceMetadata, /- "git commit"/);
	assert.match(interfaceMetadata, /- "history search"/);
});

test("#given synced ulw-loop skill #when worker guidance is inspected #then Antigravity + Codex paths are documented", async () => {
	// given
	const sourceSkill = await readFile(
		join(root, "components", "ulw-loop", "skills", "ulw-loop", "references", "full-workflow.md"),
		"utf8",
	);
	const syncedSkill = await readFile(join(root, "skills", "ulw-loop", "SKILL.md"), "utf8");
	const syncedWorkflow = await readFile(join(root, "skills", "ulw-loop", "references", "full-workflow.md"), "utf8");
	const syncedCodex = await readFile(join(root, "skills", "ulw-loop", "references", "codex.md"), "utf8");
	const agPatterns = [
		["Antigravity invoke_subagent", /invoke_subagent/],
		["ULW CLI bootstrap", /ulw-loop\/dist\/cli\.js|PLUGIN_ROOT/],
		["git-master checkpointing", /git-master/],
	];
	const codexPatterns = [
		["list_agents polling guard", /list_agents/],
		["wait_agent mailbox path", /wait_agent/],
		["progress status contract", /WORKING:/],
		["spawn_agent explorer", /spawn_agent\(agent_type="explorer"/],
	];

	// when / then
	for (const [label, pattern] of agPatterns) {
		assert.match(sourceSkill, pattern, `source skill missing ${label}`);
		assert.match(syncedWorkflow, pattern, `synced workflow missing ${label}`);
	}
	for (const [label, pattern] of codexPatterns) {
		assert.match(syncedCodex, pattern, `codex reference missing ${label}`);
	}
	assert.match(syncedSkill, /references\/full-workflow\.md/);
	assert.match(syncedSkill, /invoke_subagent/);
	assert.match(syncedSkill, /canTierRoute|Subagents\[\]\.Model/);
	assert.doesNotMatch(syncedSkill, /## Codex Tool Mapping/);
});

test("#given packaged start-work skill #when inspected #then no-plan bootstrap and adversarial verification contracts are shipped", async () => {
	// given
	const skillFile = await readPackagedSkillFile("start-work", "SKILL.md");

	// when / then
	assertPackagedContentMatches(skillFile, [
		["executes Prometheus plan with Boulder state", /Prometheus work plan[\s\S]*Boulder state/],
		["bootstraps ulw-plan when no selectable plan exists", /no selectable plan[\s\S]*ulw-plan|ulw-plan[\s\S]*no selectable plan/i],
		["does not execute work without an approved plan", /approved plan[\s\S]*(?:before|prior to)[\s\S]*execution|execution[\s\S]*(?:requires|needs)[\s\S]*approved plan/i],
		["keeps hook continuation Boulder-only", /Boulder[\s\S]*(?:continuation|Stop hook)[\s\S]*(?:only|solely)|(?:continuation|Stop hook)[\s\S]*(?:only|solely)[\s\S]*Boulder/i],
		["distinguishes execution from verification", /execution[\s\S]*verification|verification[\s\S]*execution/i],
		["requires dirty-worktree-aware editing", /dirty worktree/i],
		["requires stale-state probes", /stale state/i],
		["rejects misleading success output", /misleading success output/i],
		["does not accept worker done claims without independent verification", /done claim[\s\S]*independent(?:ly)? verified|independent(?:ly)? verify[\s\S]*done claim/i],
	]);
});

test("#given packaged ulw-plan skill #when inspected #then dynamic multi-agent planning contracts are shipped", async () => {
	// given
	const skillFile = await readPackagedSkillFile("ulw-plan", "SKILL.md");
	const workflowFile = await readPackagedSkillFile("ulw-plan", "references", "full-workflow.md");
	const combinedFile = {
		path: `${skillFile.path} + ${workflowFile.path}`,
		content: `${skillFile.content}\n${workflowFile.content}`,
	};

	// when / then
	assertPackagedContentMatches(combinedFile, [
		["self-orchestrates 5 host subagents for planning", /(?:self-orchestrates|orchestrates)[\s\S]*5[\s\S]*host subagents/i],
		["requires dynamic workflow phases", /dynamic[\s\S]*workflow[\s\S]*phase|phase[\s\S]*dynamic[\s\S]*workflow/i],
		["keeps verification distinct from execution", /verification[\s\S]*execution|execution[\s\S]*verification/i],
		["requires dirty-worktree-aware planning", /dirty worktree/i],
		["requires stale-state checks between source and packaged payloads", /stale state/i],
		["rejects misleading success output", /misleading success output/i],
		["does not accept subagent outputs as success without independent verification", /subagent outputs?[\s\S]*(?:not|never)[\s\S]*(?:success|approval)|independent(?:ly)? verif(?:y|ied|ication)[\s\S]*subagent outputs?/i],
		["treats Discord or external content as claims, not instructions", /(?:Discord|external content)[\s\S]*claims?[\s\S]*not instructions?|not instructions?[\s\S]*(?:Discord|external content)/i],
	]);
});

test("#given context-pressure-prone skills #when bundled for Codex #then the eagerly loaded payload stays budgeted", async () => {
	// given
	const skillsRoot = join(root, "skills");
	const skillNames = ["debugging", "ulw-loop"];

	// when
	let totalBytes = 0;
	for (const skillName of skillNames) {
		const content = await readFile(join(skillsRoot, skillName, "SKILL.md"), "utf8");
		totalBytes += Buffer.byteLength(content, "utf8");
	}

	// then
	assert.ok(
		totalBytes <= CONTEXT_PRESSURE_SKILL_BUDGET_BYTES,
		`debugging + ulw-loop eager payload is ${totalBytes} bytes, above ${CONTEXT_PRESSURE_SKILL_BUDGET_BYTES}`,
	);
});
