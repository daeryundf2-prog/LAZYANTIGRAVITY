import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const AG_SKILLS = ["review-work", "start-work", "ulw-loop", "ulw-plan"];

const AGENT_FILES = [
	"components/ultrawork/agents/codex-ultrawork-reviewer.toml",
	"components/ultrawork/agents/plan.toml",
];

test("#given Antigravity orchestration skills #when inspected #then they teach invoke_subagent and forbid Codex wait loops", async () => {
	for (const skillName of AG_SKILLS) {
		const text = await readFile(join(root, "skills", skillName, "SKILL.md"), "utf8");
		assert.match(text, /invoke_subagent|TASK:/);
		assert.match(text, /wait_agent/);
		assert.match(
			text,
			/(?:do \*\*not\*\*|Do \*\*not\*\*|Do not use|\bnever\b)[\s\S]{0,120}`wait_agent`/i,
		);
		assert.doesNotMatch(text, /fork_turns:\s*"none"/);
		assert.doesNotMatch(text, /short wait_agent cycles/);
	}
});

test("#given Codex ULW reference #when inspected #then Codex subagent delegation is hardened", async () => {
	const text = await readFile(join(root, "skills", "ulw-loop", "references", "codex.md"), "utf8");
	assert.match(text, /spawn_agent\(agent_type=/);
	assert.match(text, /fork_turns="none"/);
	assert.match(text, /wait_agent/);
	assert.match(text, /WORKING:/);
	assert.match(text, /list_agents/);
});

test("#given ultrawork directive #when inspected #then Antigravity verifier lane replaces Codex reviewer spawn", async () => {
	const directivePath = "components/ultrawork/directive.md";
	const text = await readFile(join(root, directivePath), "utf8");

	assert.doesNotMatch(text, /any `gpt-5\.2`\s+xhigh reviewer/);
	assert.match(text, /invoke_subagent/);
	assert.match(text, /Gemini 3\.7 Flash/);
	assert.doesNotMatch(text, /spawn_agent\(agent_type=/);
	assert.doesNotMatch(text, /Call `create_goal`/);
	assert.match(text, /Do \*\*not\*\* call Codex `create_goal`/);
});

test("#given ulw-loop workflow #when inspected #then stale review refresh keeps policy changes narrow", async () => {
	const workflowPaths = [
		"components/ulw-loop/skills/ulw-loop/references/full-workflow.md",
		"skills/ulw-loop/references/full-workflow.md",
	];

	for (const workflowPath of workflowPaths) {
		const text = await readFile(join(root, workflowPath), "utf8");
		assert.match(text, /refresh current branch\/PR\/issue state/);
		assert.match(text, /preserve existing ordering\/policy/);
		assert.match(text, /separate compatibility detection from policy changes/);
	}
});

test("#given ultrawork agents #when inspected #then inter-agent commentary is treated as assignments", async () => {
	for (const agentPath of AGENT_FILES) {
		const text = await readFile(join(root, agentPath), "utf8");
		assert.match(text, /TASK:|active review assignment/);
	}
});
