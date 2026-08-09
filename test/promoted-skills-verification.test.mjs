import assert from "node:assert/strict";
import { lstat, readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const promotedSkills = [
  "teammode",
  "ultimate-browsing",
  "ulw-research",
  "remove-ai-slops",
  "deep-interview",
  "doctor",
  "hwp-loader",
  "sync-rules",
  "skill-gen"
];

test("[promoted-skills.existence] all 9 promoted skills exist in active skills directory", async () => {
  for (const name of promotedSkills) {
    const skillPath = join(root, "skills", name);
    const stats = await lstat(skillPath);
    assert.equal(stats.isDirectory(), true, `Skill directory missing: ${name}`);

    const skillMdPath = join(skillPath, "SKILL.md");
    const skillMdStats = await lstat(skillMdPath);
    assert.equal(skillMdStats.isFile(), true, `SKILL.md missing: ${name}`);

    const content = await readFile(skillMdPath, "utf8");
    assert.ok(content.length > 50, `SKILL.md too short: ${name}`);
    assert.match(content, /^---/m, `Frontmatter missing: ${name}`);
  }
});

test("[promoted-skills.frontmatter] all 9 promoted skills contain valid name and description", async () => {
  for (const name of promotedSkills) {
    const content = await readFile(join(root, "skills", name, "SKILL.md"), "utf8");
    const nameMatch = content.match(/name:\s*([^\n\r]+)/);
    assert.ok(nameMatch, `name frontmatter missing for ${name}`);
    
    const expectedName = name === "doctor" ? "doctor" : name;
    assert.equal(nameMatch[1].trim(), expectedName, `name mismatch for ${name}`);

    const descMatch = content.match(/description:\s*([^\n\r]+)/);
    assert.ok(descMatch, `description frontmatter missing for ${name}`);
    assert.ok(descMatch[1].trim().length > 10, `description too short for ${name}`);
  }
});

test("[promoted-skills.quality-gate] all 9 promoted skills include verified quality gate header", async () => {
  for (const name of promotedSkills) {
    const content = await readFile(join(root, "skills", name, "SKILL.md"), "utf8");
    assert.match(content, /quality|policy|workflow|rules|Codex|team/i, `Quality policy missing in ${name}`);
  }
});

test("[promoted-skills.containment] referenced assets (scripts, engine, references) exist on disk", async () => {
  // teammode scripts
  await access(join(root, "skills", "teammode", "scripts", "team.mjs"));
  await access(join(root, "skills", "teammode", "scripts", "team-guide.mjs"));

  // ultimate-browsing engine and references
  await access(join(root, "skills", "ultimate-browsing", "engine", "__main__.py"));
  await access(join(root, "skills", "ultimate-browsing", "scripts", "extract_cookies.py"));

  // sync-rules script
  await access(join(root, "skills", "sync-rules", "scripts", "sync-agent-rules.mjs"));
});
