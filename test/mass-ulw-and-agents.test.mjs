import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

function frontmatter(text) {
	const match = text.match(/^---\n([\s\S]*?)\n---\n/);
	assert.ok(match, "missing YAML frontmatter");
	return match[1];
}

const WRITE_TOOLS = /"(Write|Edit|MultiEdit|Bash|NotebookEdit)"/;

for (const name of ["explore", "librarian"]) {
	test(`#given agents/${name}.md #when frontmatter is parsed #then name matches and tools are read-only`, async () => {
		const text = await readFile(join(root, "agents", `${name}.md`), "utf8");
		const fm = frontmatter(text);
		assert.match(fm, new RegExp(`^name: ${name}$`, "m"));
		assert.match(fm, /^description: ".+"$/m);
		const tools = fm.match(/^tools: (\[.*\])$/m);
		assert.ok(tools, "tools list missing");
		assert.doesNotMatch(tools[1], WRITE_TOOLS);
	});
}

test("#given explore agent #when body is read #then structured results contract is present", async () => {
	const text = await readFile(join(root, "agents", "explore.md"), "utf8");
	for (const tag of ["<analysis>", "<results>", "<files>", "<answer>", "<next_steps>"]) {
		assert.ok(text.includes(tag), `explore missing ${tag}`);
	}
	assert.match(text, /Absolute paths only/);
});

test("#given librarian agent #when body is read #then commit-pinned permalink rule is present", async () => {
	const text = await readFile(join(root, "agents", "librarian.md"), "utf8");
	assert.match(text, /blob\/\{sha\}\/\{path\}#L\{start\}-L\{end\}/);
	assert.match(text, /Never invent a SHA/);
});

test("#given mass-ulw shared skill #when inspected #then node contract, verification wave and LOC ceiling hold", async () => {
	const path = join(root, "shared-skills", "skills", "mass-ulw", "SKILL.md");
	const text = await readFile(path, "utf8");
	const fm = frontmatter(text);
	assert.match(fm, /^name: mass-ulw$/m);
	assert.match(fm, /^description: ".+"$/m);
	assert.ok(text.split("\n").length <= 250, "SKILL.md exceeds 250 lines");
	const order = ["TASK:", "DELIVERABLE:", "SCOPE:", "VERIFY:", "STOP WHEN:"].map((m) => text.indexOf(m));
	assert.ok(order.every((i) => i >= 0), "node prompt field missing");
	assert.deepEqual([...order].sort((a, b) => a - b), order, "node prompt fields out of order");
	assert.match(text, /## 5\. Verify/);
	assert.match(text, /invoke_subagent/);
	await readFile(join(root, "shared-skills", "skills", "mass-ulw", "references", "planning.md"), "utf8");
});
