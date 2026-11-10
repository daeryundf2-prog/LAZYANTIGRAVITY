import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RULES, scanText } from "../shared-skills/skills/visual-qa/scripts/ui-slop.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "shared-skills", "skills", "visual-qa", "scripts", "ui-slop.mjs");
const ids = (html, ext = ".html") => scanText(html, ext).map((f) => f.rule);

test("ui-slop flags known slop signatures with their line", () => {
	const html = '<div>\n<h1 style="background-clip: text">Seamless</h1>\n<a href="#">x</a>\n</div>';
	const found = scanText(html);
	assert.ok(found.some((f) => f.rule === "surface.gradient-text" && f.line === 2));
	assert.ok(found.some((f) => f.rule === "copy.cliche"));
	assert.ok(found.some((f) => f.rule === "quality.dead-anchor" && f.line === 3));
});

test("ui-slop leaves a clean snippet without findings", () => {
	const clean = '<main><h1>Invoices</h1><img src="a.png" alt="Chart of invoices" width="10" height="10"><a href="/billing">Billing</a></main>';
	assert.deepEqual(ids(clean), []);
});

test("ui-slop alt rule follows the attribute, not the tag", () => {
	assert.ok(ids('<img src="a.png" width="1" height="1">').includes("quality.missing-alt"));
	assert.ok(!ids('<img src="a.png" alt="" width="1" height="1">').includes("quality.missing-alt"));
});

test("ui-slop reduced-motion rule is satisfied by a prefers-reduced-motion block", () => {
	const motion = ".a{transition: opacity .2s}";
	assert.ok(ids(motion, ".css").includes("motion.missing-reduced-motion"));
	assert.ok(!ids(motion + "@media (prefers-reduced-motion: reduce){.a{transition:none}}", ".css").includes("motion.missing-reduced-motion"));
});

test("ui-slop only applies css rules to css-like files", () => {
	assert.ok(!ids("transition: all .3s", ".md").includes("motion.transition-all"));
	assert.ok(ids("transition: all .3s", ".css").includes("motion.transition-all"));
});

test("ui-slop registry has unique rule ids and every rule carries severity and kind", () => {
	assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
	for (const r of RULES) assert.match(r.severity, /^P[123]$/, r.id);
});

test("ui-slop CLI is review-only: findings never change the exit code", () => {
	const dir = mkdtempSync(join(tmpdir(), "ui-slop-"));
	try {
		writeFileSync(join(dir, "a.html"), '<img src="x.png"><a href="#">go</a>');
		const res = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
		assert.equal(res.status, 0, res.stderr);
		const out = JSON.parse(res.stdout);
		assert.equal(out.reviewOnly, true);
		assert.ok(out.findings.length >= 2);
		assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" }).status, 2);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
