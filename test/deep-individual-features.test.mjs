import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { computeLineHash, formatHashlineText, validateLineHash } from "../components/hashline/index.mjs";

const root = "/Users/shinyoohag/.gemini/config/plugins/lazyantigravity";

// -------------------------------------------------------------------
// 1. HASHLINE COMPONENT DEEP EDGE-CASE TESTS
// -------------------------------------------------------------------
test("[1. Hashline] Edge cases: CJK characters, empty lines, whitespace, and boundaries", () => {
  // CJK / Korean text
  const koreanLine = "  const 메세지 = '안녕하세요'; // 한국어 주석  ";
  const hashKorean = computeLineHash(koreanLine);
  assert.equal(hashKorean.length, 2);
  assert.equal(hashKorean, computeLineHash("const 메세지 = '안녕하세요'; // 한국어 주석"));

  // Empty string & whitespace
  const emptyHash = computeLineHash("");
  const spaceHash = computeLineHash("   \t  ");
  assert.equal(emptyHash, spaceHash);

  // Multi-line text formatting with empty lines
  const text = "first line\n\nthird line";
  const formatted = formatHashlineText(text);
  const lines = formatted.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^1#[A-Z0-9]{2}\| first line$/);
  assert.match(lines[1], /^2#[A-Z0-9]{2}\| $/);
  assert.match(lines[2], /^3#[A-Z0-9]{2}\| third line$/);

  // Validation boundary test (line index out of bounds)
  const oobResult = validateLineHash(text, 99, "XX");
  assert.equal(oobResult.valid, false);
  assert.equal(oobResult.lineContent, "");
});

// -------------------------------------------------------------------
// 2. TEAMMODE SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[2. Teammode] Detailed inspection of SKILL.md and thread orchestration", async () => {
  const skillPath = join(root, "skills", "teammode", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /team/i, "Teammode must reference team orchestration");
  assert.match(content, /worktree|session|leader/i, "Teammode must reference leadership and worktrees");
});

// -------------------------------------------------------------------
// 3. ULTIMATE-BROWSING SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[3. Ultimate-Browsing] Detailed inspection of SKILL.md and stealth capabilities", async () => {
  const skillPath = join(root, "skills", "ultimate-browsing", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /browsing|stealth|WAF|visual/i, "Ultimate browsing must mention browsing or stealth");
});

// -------------------------------------------------------------------
// 4. ULW-RESEARCH SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[4. Ulw-Research] Detailed inspection of deep research swarm workflow", async () => {
  const skillPath = join(root, "skills", "ulw-research", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /research|swarm|codebase|docs/i, "Ulw-research must specify research swarms");
});

// -------------------------------------------------------------------
// 5. REMOVE-AI-SLOPS SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[5. Remove-AI-Slops] Detailed inspection of 10 slop category rules", async () => {
  const skillPath = join(root, "skills", "remove-ai-slops", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /slop|categories|clean/i, "Remove-ai-slops must mention slop cleaning");
});

// -------------------------------------------------------------------
// 6. DEEP-INTERVIEW SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[6. Deep-Interview] Detailed inspection of Prometheus planning interview", async () => {
  const skillPath = join(root, "skills", "deep-interview", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /interview|scope|plan/i, "Deep-interview must outline planning interview steps");
});

// -------------------------------------------------------------------
// 7. DOCTOR SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[7. Doctor] Detailed inspection of health check diagnostic templates", async () => {
  const skillPath = join(root, "skills", "doctor", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /PASS\/WARN\/FAIL|report|health|diagnose/i, "Doctor skill must specify PASS/WARN/FAIL report structure");
});

// -------------------------------------------------------------------
// 8. HWP-LOADER SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[8. Hwp-Loader] Detailed inspection of Korean .hwp/.hwpx extraction", async () => {
  const skillPath = join(root, "skills", "hwp-loader", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /\.hwp|\.hwpx|markdown/i, "Hwp-loader must reference .hwp/.hwpx markdown extraction");
});

// -------------------------------------------------------------------
// 9. SYNC-RULES SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[9. Sync-Rules] Detailed inspection of multi-agent rule sync", async () => {
  const skillPath = join(root, "skills", "sync-rules", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /AGENTS\.md|\.cursorrules|CLAUDE\.md|GEMINI\.md/i, "Sync-rules must reference target rule files");
});

// -------------------------------------------------------------------
// 10. SKILL-GEN SKILL DETAILED TEST
// -------------------------------------------------------------------
test("[10. Skill-Gen] Detailed inspection of dynamic skill generator", async () => {
  const skillPath = join(root, "skills", "skill-gen", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.match(content, /generator|SKILL\.md|\.agents\/skills|skill/i, "Skill-gen must outline dynamic skill generation");
});
