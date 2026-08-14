import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const SKILLS = [
	"review-work",
	"start-work",
	"ulw-loop",
	"ulw-plan",
];

const AGENT_FILES = [
	"components/ultrawork/agents/codex-ultrawork-reviewer.toml",
	"components/ultrawork/agents/plan.toml",
];

test("#given orchestration skills #when inspected #then Codex subagent delegation is hardened", async () => {
	// given / when / then
	const skillPaths = SKILLS.map((skillName) => join("skills", skillName, "SKILL.md"));

	for (const skillPath of skillPaths) {
		const text = await readFile(join(root, skillPath), "utf8");
		assert.match(text, /TASK:/);
		assert.match(text, /fork_turns:\s*"none"/);
		assert.match(text, /wait_agent.*mailbox signals/s);
		assert.match(text, /Fallback only when/);
		assert.match(text, /respawn.*smaller/s);
		assert.match(text, /model.*reasoning_effort.*default agent/s);
		assert.match(text, /Plan and reviewer agents may run for a long time/);
		assert.match(text, /short wait_agent cycles/);
		assert.match(text, /single long blocking wait/);
		assert.match(text, /A timeout only means no new mailbox update arrived/i);
		assert.match(text, /WORKING:/);
		assert.match(text, /single `list_agents`/);
	}
});

test("#given ultrawork directive #when inspected #then reviewer fallback keeps an agent role", async () => {
	// given
	const directivePath = "components/ultrawork/directive.md";

	// when
	const text = await readFile(join(root, directivePath), "utf8");

	// then
	assert.doesNotMatch(text, /any `gpt-5\.2`\s+xhigh reviewer/);
	assert.match(text, /codex-ultrawork-reviewer/);
	assert.match(text, /agent_type.*worker/s);
	assert.match(text, /model.*reasoning_effort.*default agent/s);
	assert.match(text, /timeout only means no new mailbox update arrived/i);
	assert.match(text, /WORKING:/);
	assert.match(text, /single `list_agents`/);
});

test("#given ulw-loop workflow #when inspected #then stale review refresh keeps policy changes narrow", async () => {
	// given / when / then
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
	// given / when / then
	const agentPaths = AGENT_FILES;

	for (const agentPath of agentPaths) {
		const text = await readFile(join(root, agentPath), "utf8");
		assert.match(text, /TASK:|active review assignment/);
		assert.match(text, /context|commentary/);
	}
});
