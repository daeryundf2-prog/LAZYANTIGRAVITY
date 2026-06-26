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
];

const AGENT_FILES = [
	"components/ultrawork/agents/lazycodex-gate-reviewer.toml",
	"components/ultrawork/agents/plan.toml",
];

test("#given orchestration skills #when inspected #then Codex subagent delegation is hardened", async () => {
	// given
	const skillPaths = SKILLS.map((skillName) => join("skills", skillName, "SKILL.md"));

	// when
	const missing = [];
	for (const skillPath of skillPaths) {
		const text = await readFile(join(root, skillPath), "utf8");
		if (
			!/TASK:/.test(text) ||
			!(/fork_turns:\s*"none"/.test(text) || /fork_context:\s*false/.test(text)) ||
			!(/wait_agent/s.test(text)) ||
			!/Fallback only when/i.test(text) ||
			!/respawn/i.test(text) ||
			!/Plan and reviewer agents/i.test(text) ||
			!/blocking wait/i.test(text) ||
			!/A timeout only means/i.test(text) ||
			!/WORKING:/.test(text)
		) {
			missing.push(skillPath);
		}
	}

	// then
	assert.deepEqual(missing, []);
});

test("#given ultrawork directive #when inspected #then reviewer fallback keeps an agent role", async () => {
	// given
	const directivePath = "components/ultrawork/directive.md";

	// when
	const text = await readFile(join(root, directivePath), "utf8");

	// then
	assert.doesNotMatch(text, /any `gpt-5\.2`\s+xhigh reviewer/);
	assert.match(text, /reviewer/);
	assert.match(text, /agent_type/);
	assert.match(text, /model/);
	assert.match(text, /timeout only means/i);
	assert.match(text, /WORKING:/);
});

test("#given ulw-loop workflow #when inspected #then stale review refresh keeps policy changes narrow", async () => {
	// given
	const workflowPaths = [
		"components/ulw-loop/skills/ulw-loop/references/full-workflow.md",
		"skills/ulw-loop/references/full-workflow.md",
	];

	// when
	const missing = [];
	for (const workflowPath of workflowPaths) {
		const text = await readFile(join(root, workflowPath), "utf8");
		if (
			!/refresh current branch\/PR\/issue state/.test(text) ||
			!/preserve existing ordering\/policy/.test(text) ||
			!/separate compatibility detection from policy changes/.test(text)
		) {
			missing.push(workflowPath);
		}
	}

	// then
	assert.deepEqual(missing, []);
});

test("#given ultrawork agents #when inspected #then inter-agent commentary is treated as assignments", async () => {
	// given
	const agentPaths = AGENT_FILES;

	// when
	const missing = [];
	for (const agentPath of agentPaths) {
		const text = await readFile(join(root, agentPath), "utf8");
		if (!/TASK:|Input|recommendation/.test(text) || !/context|commentary/.test(text)) {
			missing.push(agentPath);
		}
	}

	// then
	assert.deepEqual(missing, []);
});
