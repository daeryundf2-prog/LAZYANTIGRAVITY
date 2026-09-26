import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkSkillsDrift, resolveSkillSources } from "../scripts/check-skills-drift.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("#given materialized skills tree #when drift audited #then every file is byte-identical to its source", async () => {
	// when
	const report = await checkSkillsDrift(root);

	// then
	assert.deepEqual(report.missing, [], "source files absent from skills/");
	assert.deepEqual(report.drifted, [], "skills/ files whose bytes differ from source");
	assert.deepEqual(report.extra, [], "skills/ files with no source counterpart");
	assert.deepEqual(report.staleDirs, [], "skills/ dirs with no source");
	assert.ok(report.checkedFiles > 100, `expected a real audit, only ${report.checkedFiles} files checked`);
});

test("#given fixture tree #when a file drifts, is missing, extra, and a stale dir exists #then each is reported", async () => {
	// given
	const tmp = await mkdtemp(join(tmpdir(), "skills-drift-"));
	const sourceDir = join(tmp, "src-skill");
	const skillsRoot = join(tmp, "skills");
	await mkdir(join(sourceDir, "references"), { recursive: true });
	await mkdir(join(skillsRoot, "demo", "references"), { recursive: true });
	await mkdir(join(skillsRoot, "ghost"), { recursive: true });
	await writeFile(join(sourceDir, "SKILL.md"), "alpha\n");
	await writeFile(join(sourceDir, "references", "a.md"), "ref-a\n");
	await writeFile(join(sourceDir, "references", "gone.md"), "not copied\n");
	await writeFile(join(skillsRoot, "demo", "SKILL.md"), "alpha MODIFIED\n");
	await writeFile(join(skillsRoot, "demo", "references", "a.md"), "ref-a\n");
	await writeFile(join(skillsRoot, "demo", "references", "unsourced.md"), "extra\n");
	try {
		// when
		const report = await checkSkillsDrift(tmp, { sources: new Map([["demo", sourceDir]]) });

		// then
		assert.deepEqual(report.drifted, ["demo/SKILL.md"]);
		assert.deepEqual(report.missing, ["demo/references/gone.md"]);
		assert.deepEqual(report.extra, ["demo/references/unsourced.md"]);
		assert.deepEqual(report.staleDirs, ["ghost"]);
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
});

test("#given repo sources #when resolved #then component skills override shared dirs and references is mapped", async () => {
	// when
	const sources = await resolveSkillSources(root);

	// then
	assert.equal(sources.get("ulw-loop"), join(root, "components/ulw-loop/skills/ulw-loop"));
	assert.equal(sources.get("ulw-plan"), join(root, "components/ultrawork/skills/ulw-plan"));
	assert.equal(sources.get("references"), join(root, "shared-skills/references"));
	assert.equal(sources.get("programming"), join(root, "shared-skills/skills/programming"));
});
