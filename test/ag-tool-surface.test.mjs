import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const OPENCODE_KWARGS = /\b(?:subagent_type|run_in_background|load_skills)\s*=/;
const OPENCODE_DISPATCH = /\b(?:call_omo_agent|team_create|team_send_message)\s*\(/;
const SPAWN_EXAMPLE = /\bspawn_agent\s*\(\s*agent_type=/;

function stripForbidMentions(content) {
	return content
		.replaceAll("OpenCode `task(...)` / `call_omo_agent(...)`", "")
		.replaceAll("`task(...)`", "")
		.replaceAll("`call_omo_agent(...)`", "")
		.replaceAll("`team_*(...)`", "")
		.replace(/Do \*\*not\*\*[^\n]*`spawn_agent`[^\n]*/g, "")
		.replace(/do \*\*not\*\*[^\n]*`spawn_agent`[^\n]*/gi, "")
		.replace(/Do \*\*not\*\* call Codex `create_goal`[^\n]*/g, "")
		.replace(/Treating `subagent_type=`[^\n]*/g, "")
		.replace(/Do \*\*not\*\* invent OpenCode kwargs[^\n]*/g, "")
		.replace(/OpenCode `task\(\.\.\.\)`, `call_omo_agent\(\.\.\.\)`, `team_\*\(\.\.\.\)`/g, "");
}

test("#given AG session rules #when inspected #then they teach invoke_subagent not spawn_agent examples", async () => {
	const files = [
		join(root, "components", "rules", "bundled-rules", "hephaestus.md"),
		join(root, "components", "ultrawork", "directive.md"),
		join(root, "skills", "references", "antigravity-tools.md"),
	];
	for (const file of files) {
		const content = await readFile(file, "utf8");
		const stripped = stripForbidMentions(content);
		assert.match(content, /invoke_subagent/, `${basename(file)} missing invoke_subagent`);
		assert.doesNotMatch(stripped, SPAWN_EXAMPLE, `${basename(file)} still teaches spawn_agent(agent_type=)`);
		assert.doesNotMatch(stripped, OPENCODE_DISPATCH, `${basename(file)} still teaches OpenCode team/call_omo dispatch`);
	}
});

test("#given AG default skill surfaces #when scanned #then OpenCode kwargs are not dispatch examples", async () => {
	const skillsDir = join(root, "skills");
	const skillEntries = await readdir(skillsDir, { withFileTypes: true });
	const offenders = [];
	for (const entry of skillEntries) {
		if (!entry.isDirectory() || entry.name === "references") continue;
		const skillPath = join(skillsDir, entry.name, "SKILL.md");
		const content = stripForbidMentions(await readFile(skillPath, "utf8"));
		if (OPENCODE_KWARGS.test(content) || OPENCODE_DISPATCH.test(content) || SPAWN_EXAMPLE.test(content)) {
			offenders.push(entry.name);
		}
	}
	assert.deepEqual(offenders, []);
});

test("#given AG hooks #when PreToolUse inspected #then create_goal matcher is absent", async () => {
	const hooks = JSON.parse(await readFile(join(root, "hooks.json"), "utf8"));
	const matchers = (hooks.hooks.PreToolUse ?? []).map((group) => group.matcher);
	assert.equal(matchers.some((matcher) => /create_goal/i.test(matcher ?? "")), false);
	assert.ok(matchers.some((matcher) => /Bash/i.test(matcher ?? "")));
});

test("#given model catalog #when top-level current is read #then Gemini 3.7 Flash High is the default hint", async () => {
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));
	assert.equal(catalog.current.model, "gemini-3.7-flash-high");
	assert.equal(catalog.antigravity.canAutoRoute, false);
	assert.equal(catalog.antigravity.canTierRoute, true);
	assert.equal(catalog.antigravity.routingMode, "model-tier");
	assert.equal(catalog.antigravity.tierMap.verifier, "pro");
	assert.equal(catalog.antigravity.roles.default.modelId, "gemini-3.7-flash-high");
	assert.equal(catalog.perRoleRouting.antigravity.supported, true);
});
