#!/usr/bin/env node
import { cp, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sharedSkillsRootPath } from "../shared-skills/index.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillsRoot = join(root, "skills");
const experimentalRoot = join(root, "experimental-skills");
const sharedSkillsRoot = sharedSkillsRootPath();
const catalog = JSON.parse(await readFile(join(root, "config", "antigravity-skills.json"), "utf8"));

const activeSkills = catalog.core.map(({ name }) => name);
const experimentalSkills = catalog.experimental.map(({ name }) => name);

async function assertSharedSkillsRoot() {
	const stats = await lstat(sharedSkillsRoot);
	if (!stats.isDirectory()) throw new Error(`shared skills root is not a directory: ${sharedSkillsRoot}`);
}

const qualityGateText = `## Verified quality-gate policy

After edits, request on-demand LSP verification with server id \`lsp\`, tool \`diagnostics\`, and exact arguments \`{filePath:"<absolute changed file>",severity:"error"}\`.

Use the checked fixtures as the contract source:

- \`test/fixtures/lsp/clean.json\` renders \`LSP verification: clean (<file>)\`
- \`test/fixtures/lsp/diagnostics.json\` renders \`LSP verification: <N> error(s) (<file>)\`
- \`test/fixtures/lsp/unavailable.json\` renders \`LSP verification unavailable: <reason>\`

Treat unavailable verification as unavailable, never as clean.
`;

const startWorkText = `## Start-work state

Use Antigravity Stop continuation state keys prefixed exactly as \`antigravity:<conversationId>\`.
Continue only from the active Boulder work record for that session key, and stop when workspace, active work, or session ownership is missing or ambiguous.
`;

const coreBodies = new Map([
	["ast-grep", "Use this skill for deterministic syntax-aware search and codemods. Prefer Antigravity `grep_search` for plain text and `run_command` for approved local ast-grep commands."],
	["debugging", "Use this skill for evidence-led runtime diagnosis. Reproduce first, inspect with `view_file`, `grep_search`, and `run_command`, then verify the minimal fix."],
	["frontend-ui-ux", "Use this skill for frontend UI, UX, accessibility, and visual quality work. Verify observable behavior with native Antigravity tools before claiming the interface is ready."],
	["git-master", "Use this skill for user-authorized Git history and publication work. Inspect state with `run_command` and preserve unrelated user changes."],
	["init-deep", "Use this skill to build repository-local instruction knowledge. Read existing guidance with `find_by_name`, `list_dir`, and `view_file` before writing."],
	["lsp", "Use this skill for language-server diagnostics. Call the local MCP server through Antigravity's tool interface with server id `lsp` and tool `diagnostics`; do not use double-underscore tool names."],
	["lsp-setup", "Use this skill to detect, configure, and verify language servers. Keep setup local, explicit, and reversible."],
	["programming", "Use this skill for typed implementation across Python, Rust, TypeScript, and Go. Prefer strict types, focused tests, and native Antigravity file and command tools."],
	["review-work", "Use this skill after meaningful implementation work to verify goal fit, quality, security, and hands-on behavior with Antigravity native subagents where useful."],
	["rules", "Use this skill for repository rule discovery and project instruction handling. Treat rule injection as explicit Antigravity context, not an automatic post-edit diagnostic."],
	["start-work", "Use this skill to execute an approved Prometheus work plan with Boulder state, evidence receipts, and native Antigravity Stop continuation."],
	["ulw", [
		"Use this skill as the fresh-install shorthand for `ulw-loop`: run durable, evidence-backed execution loops with native Antigravity collaboration tools, including `invoke_subagent`, `send_message`, and `manage_subagents`.",
		"",
		"## Fresh-install execution",
		"",
		"If `ulw-loop` is available in the active skill list, follow that skill's workflow. If only this `ulw` skill is visible, execute the same bounded loop directly:",
		"",
		"1. Restate the user-visible goal and keep work tied to explicit completion gates.",
		"2. Break the task into small, verifiable steps and keep exactly one step in progress.",
		"3. Capture evidence for each completed step before claiming progress.",
		"4. Use native Antigravity collaboration tools for bounded delegation only when they are useful.",
		"5. Stop only when the requested outcome is implemented, verified, and summarized with remaining limits.",
	].join("\n")],
	["ulw-loop", "Use this skill for durable, evidence-backed execution loops. Keep progress bounded, verifiable, and tied to explicit completion gates."],
	["ulw-plan", "Use this skill for decision-complete planning before high-risk multi-module implementation. Explore first, ask only unresolved forks, and hand off a worker-ready plan."],
	["visual-qa", "Use this skill for observable visual verification of web and terminal interfaces. Capture evidence and distinguish functional, accessibility, and visual-fidelity findings."],
]);

const descriptions = new Map([
	["ast-grep", "Use ast-grep for syntax-aware code search and deterministic rewrites with Antigravity-native tool calls."],
	["debugging", "Use for evidence-led runtime debugging, reproduction, root-cause isolation, and verified fixes."],
	["frontend-ui-ux", "Use for frontend, UI, UX, accessibility, and visual quality work."],
	["git-master", "Use for explicit, user-authorized Git history and publication workflows."],
	["init-deep", "Use for repository-local instruction discovery and hierarchy generation."],
	["lsp", "Use for on-demand language-server diagnostics through the local LSP MCP server."],
	["lsp-setup", "Use for portable language-server detection and configuration guidance."],
	["programming", "Use for typed implementation practices and language-specific quality gates."],
	["review-work", "Use for independent post-implementation correctness, security, and QA review."],
	["rules", "Use for repository rule discovery and explicit project instruction handling."],
	["start-work", "Use to execute an approved repository work plan with Boulder state and evidence receipts."],
	["ulw", "Use for bounded parallel execution with native Antigravity collaboration tools."],
	["ulw-loop", "Use for durable, evidence-backed execution loops with explicit completion gates."],
	["ulw-plan", "Use for decision-complete planning before high-risk multi-module implementation."],
	["visual-qa", "Use for observable visual verification of web and terminal interfaces."],
]);

function skillText(name) {
	const description = descriptions.get(name);
	const body = coreBodies.get(name);
	if (!description || !body) throw new Error(`missing core skill template: ${name}`);
	const sections = [
		"---",
		`name: ${name}`,
		`description: ${description}`,
		"---",
		"",
		`# ${name}`,
		"",
		body,
		"",
		qualityGateText.trim(),
	];
	if (name === "start-work") sections.push("", startWorkText.trim());
	return `${sections.join("\n")}\n`;
}

async function archiveExperimentalSkills() {
	await mkdir(experimentalRoot, { recursive: true });
	for (const name of experimentalSkills) {
		const archived = join(experimentalRoot, name);
		try {
			const stats = await lstat(archived);
			if (stats.isDirectory()) continue;
			throw new Error("not-directory");
		} catch {
			// Missing archives are restored from the current generated tree or the approved source map below.
		}
		try {
			const stats = await lstat(archived);
			if (stats.isDirectory()) continue;
		} catch {
			const currentGenerated = join(skillsRoot, name);
			try {
				await cp(currentGenerated, archived, { recursive: true, errorOnExist: true });
			} catch {
				await cp(resolveSource(name), archived, { recursive: true, errorOnExist: true });
			}
		}
	}
}

function resolveSource(name) {
	const componentSources = new Map([
		["comment-checker", "components/comment-checker/skills/comment-checker"],
	]);
	const componentSource = componentSources.get(name);
	if (componentSource) return join(root, componentSource);
	const aliasName = name === "frontend-ui-ux" ? "frontend" : name;
	return join(root, "skill-aliases", aliasName);
}

await assertSharedSkillsRoot();
await archiveExperimentalSkills();
await rm(skillsRoot, { recursive: true, force: true });
await mkdir(skillsRoot, { recursive: true });

for (const name of activeSkills) {
	const skillRoot = join(skillsRoot, name);
	await mkdir(skillRoot, { recursive: true });
	await writeFile(join(skillRoot, "SKILL.md"), skillText(name), "utf8");
}
