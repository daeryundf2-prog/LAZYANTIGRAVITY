#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sharedSkillsRootPath } from "@oh-my-opencode/shared-skills";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sharedSkillsRoot = sharedSkillsRootPath();
const skillsRoot = join(root, "skills");
const skillSources = [
	["comment-checker", "components/comment-checker/skills/comment-checker"],
	["lsp", "components/lsp/skills/lsp"],
	["rules", "components/rules/skills/rules"],
	["ulw-loop", "components/ulw-loop/skills/ulw-loop"],
	["ulw-plan", "components/ultrawork/skills/ulw-plan"],
];

const opencodeOnlyOrchestrationPattern = /\b(?:call_omo_agent|background_output|team_[a-z_]+|task|spawn_agent|wait_agent)\s*\(/;

const antigravityHarnessToolCompatibility = `## Antigravity Harness Tool Compatibility

This skill may include examples copied from the OpenCode or Codex harnesses. In Antigravity, do not call OpenCode/Codex-specific tools such as \`call_omo_agent(...)\`, \`spawn_agent(...)\`, \`task(...)\`, \`background_output(...)\`, \`wait_agent(...)\`, or \`close_agent(...)\` literally. Translate those examples to Antigravity native tools:

| OpenCode/Codex example | Antigravity tool to use |
| --- | --- |
| \`call_omo_agent(subagent_type="explore", ...)\` or \`spawn_agent(agent_type="explorer", ...)\` | \`invoke_subagent(Subagents: [{TypeName: "research", Role: "Codebase Researcher", Prompt: "..."}])\` |
| \`call_omo_agent(subagent_type="librarian", ...)\` or \`spawn_agent(agent_type="librarian", ...)\` | \`invoke_subagent(Subagents: [{TypeName: "research", Role: "Codebase Researcher", Prompt: "..."}])\` |
| \`task(subagent_type="plan", ...)\` or \`spawn_agent(agent_type="plan", ...)\` | \`invoke_subagent(Subagents: [{TypeName: "self", Role: "Prometheus Planner", Prompt: "..."}])\` |
| \`task(subagent_type="oracle", ...)\` or \`spawn_agent(agent_type="codex-ultrawork-reviewer", ...)\` | \`invoke_subagent(Subagents: [{TypeName: "self", Role: "Oracle Reviewer", Prompt: "..."}])\` |
| \`task(category="...", ...)\` or \`spawn_agent(agent_type="worker", ...)\` | \`invoke_subagent(Subagents: [{TypeName: "self", Role: "Hephaestus Worker", Prompt: "..."}])\` |
| \`background_output(task_id="...")\` or \`wait_agent(...)\` | Antigravity is reactive: you will automatically be resumed when a subagent sends a message. Simply stop calling tools/go idle while waiting. |
| \`team_*(...)\` | Use \`invoke_subagent\` to start concurrent subagents, then communicate with \`send_message(Recipient, Message)\`. |
| \`close_agent(...)\` or \`kill\` | \`manage_subagents(Action="kill", ConversationIds=[...])\` |

Antigravity subagents can be spawned with \`invoke_subagent\`. Use the \`self\` subagent type to inherit the parent config but run in a separate context, and \`research\` type to delegate read-only codebase or web search tasks. Communicate with active subagents using the \`send_message\` tool by their conversation ID. If a code block below conflicts with this section, this section wins.

For work likely to exceed one cycle, instruct the subagent to report progress regularly. When you launch a subagent or start a task in the background, you do not need to poll or check status in a loop. You will be automatically notified when there is an update. Simply go idle or proceed with other work.

`;

function insertAntigravityCompatibilityGuidance(content) {
	if (!opencodeOnlyOrchestrationPattern.test(content)) return content;
	if (content.includes("## Antigravity Harness Tool Compatibility")) return content;

	const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n+/);
	if (!frontmatterMatch) {
		return `${antigravityHarnessToolCompatibility}${content}`;
	}

	return `${frontmatterMatch[0]}${antigravityHarnessToolCompatibility}${content.slice(frontmatterMatch[0].length)}`;
}

async function adaptSkillForAntigravity(skillName) {
	const skillPath = join(skillsRoot, skillName, "SKILL.md");
	const content = await readFile(skillPath, "utf8");
	const adapted = insertAntigravityCompatibilityGuidance(content);
	if (adapted !== content) {
		await writeFile(skillPath, adapted, "utf8");
	}
}

await rm(skillsRoot, { recursive: true, force: true });
await mkdir(skillsRoot, { recursive: true });

for (const [name, source] of skillSources) {
	await cp(join(root, source), join(skillsRoot, name), { recursive: true });
	await adaptSkillForAntigravity(name);
}

const componentSkillNames = new Set(skillSources.map(([name]) => name));

const sharedSkillEntries = await readdir(sharedSkillsRoot, { withFileTypes: true });
const sharedSkillNames = sharedSkillEntries
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

for (const skillName of sharedSkillNames) {
	const targetName = skillName === "frontend" ? "frontend-ui-ux" : skillName;
	if (componentSkillNames.has(targetName)) continue;
	await cp(join(sharedSkillsRoot, skillName), join(skillsRoot, targetName), { recursive: true });
	await adaptSkillForAntigravity(targetName);
}

// Copy standalone alias skills from skill-aliases/ (separate from skills/ which is rebuilt)
const aliasesRoot = join(root, "skill-aliases");
try {
	const aliasEntries = await readdir(aliasesRoot, { withFileTypes: true });
	for (const entry of aliasEntries) {
		if (entry.isDirectory()) {
			const targetName = entry.name === "frontend" ? "frontend-ui-ux" : entry.name;
			await cp(join(aliasesRoot, entry.name), join(skillsRoot, targetName), { recursive: true });
		}
	}
} catch {
	// No skill-aliases directory — skip silently
}
