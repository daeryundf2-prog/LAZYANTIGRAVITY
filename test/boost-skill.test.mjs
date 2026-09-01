import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillPath = join(root, "skills", "boost", "SKILL.md");
const sharedSkillPath = join(root, "shared-skills", "skills", "boost", "SKILL.md");

test("#given boost skill #when inspected #then it defines the 5-stage deep reasoning & verification pipeline", async () => {
	const skill = await readFile(skillPath, "utf8");

	assert.match(skill, /^---\r?\nname: boost\r?\n/m);
	assert.match(skill, /Extended Cognitive Planning/);
	assert.match(skill, /3-Wave Multi-Perspective Swarm/);
	assert.match(skill, /Strict Discipline Implementation/);
	assert.match(skill, /Pro-Tier 5-Oracle Gate/);
	assert.match(skill, /Evidence-Bound Delivery/);
	assert.match(skill, /\/boost/);
});

test("#given boost skill in shared-skills #when compared #then it stays in sync with plugin skill", async () => {
	const skill = await readFile(skillPath, "utf8");
	const sharedSkill = await readFile(sharedSkillPath, "utf8");

	assert.equal(skill, sharedSkill);
});
