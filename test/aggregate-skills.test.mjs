import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import {
	findRoleSpecificSpawnsWithoutForkTurnsNone,
	findSpawnAgentTypes,
	root,
} from "./aggregate-plugin-fixture.mjs";

test("#given Codex compatibility reference #when spawn_agent roles are listed #then matching TOMLs are bundled", async () => {
	const codexPath = join(root, "skills", "ulw-loop", "references", "codex.md");
	const content = await readFile(codexPath, "utf8");
	const referencedAgentTypes = findSpawnAgentTypes(content).filter(
		(agentType) => agentType !== "worker" && agentType !== "codex-ultrawork-reviewer",
	);

	assert.deepEqual(referencedAgentTypes, ["explorer", "plan"]);

	for (const agentType of referencedAgentTypes) {
		const tomlPath = join(root, "components", "ultrawork", "agents", `${agentType}.toml`);
		const fileStat = await stat(tomlPath);
		assert.equal(fileStat.isFile(), true);
		assert.equal(basename(tomlPath), `${agentType}.toml`);
	}
});

test('#given Codex reference prompts #when role-specific agents are spawned #then they set fork_turns="none"', async () => {
	const promptFiles = [join(root, "skills", "ulw-loop", "references", "codex.md")];

	const missingForkTurns = [];
	for (const promptPath of promptFiles) {
		const content = await readFile(promptPath, "utf8");
		for (const call of findRoleSpecificSpawnsWithoutForkTurnsNone(content)) {
			missingForkTurns.push(`${basename(dirname(promptPath))}/${basename(promptPath)}: ${call}`);
		}
	}

	assert.deepEqual(missingForkTurns, []);
});

test("#given Hephaestus session rule #when inspected #then it is Antigravity-first", async () => {
	const content = await readFile(join(root, "components", "rules", "bundled-rules", "hephaestus.md"), "utf8");
	assert.match(content, /invoke_subagent/);
	assert.match(content, /Google Antigravity/);
	assert.doesNotMatch(content, /spawn_agent\(agent_type=/);
});

test("#given Antigravity-default orchestration skills #when inspected #then they teach invoke_subagent and forbid Codex wait loops", async () => {
	const promptFiles = [
		join(root, "skills", "ulw-loop", "SKILL.md"),
		join(root, "skills", "ulw-loop", "references", "full-workflow.md"),
		join(root, "skills", "review-work", "SKILL.md"),
		join(root, "skills", "start-work", "SKILL.md"),
		join(root, "skills", "ulw-plan", "SKILL.md"),
	];

	const failures = [];
	for (const promptPath of promptFiles) {
		const content = await readFile(promptPath, "utf8");
		const label = `${basename(dirname(promptPath))}/${basename(promptPath)}`;
		if (!content.includes("invoke_subagent")) {
			failures.push(`${label}: missing invoke_subagent`);
		}
		if (/As each completes, collect via the Codex mapping above \(`wait_agent`/.test(content)) {
			failures.push(`${label}: still teaches Codex wait_agent collection`);
		}
		if (/\bspawn_agent\(agent_type=/.test(content)) {
			failures.push(`${label}: still uses spawn_agent(agent_type=) in AG default path`);
		}
	}

	assert.deepEqual(failures, []);
});

test("#given AG default skill surfaces #when scanned #then OpenCode task/call_omo_agent are not primary dispatch examples", async () => {
	const skillsDir = join(root, "skills");
	const skillEntries = await readdir(skillsDir, { withFileTypes: true });
	const skillFiles = skillEntries
		.filter((entry) => entry.isDirectory() && entry.name !== "references")
		.map((entry) => join(skillsDir, entry.name, "SKILL.md"));

	const offenders = [];
	for (const skillPath of skillFiles) {
		const content = await readFile(skillPath, "utf8");
		const stripped = content
			.replaceAll("OpenCode `task(...)` / `call_omo_agent(...)`", "")
			.replaceAll("`task(...)`", "")
			.replaceAll("`call_omo_agent(...)`", "");
		if (/\btask\s*\(/.test(stripped) || /\bcall_omo_agent\s*\(/.test(stripped)) {
			offenders.push(basename(dirname(skillPath)));
		}
	}

	assert.deepEqual(offenders, []);
});
