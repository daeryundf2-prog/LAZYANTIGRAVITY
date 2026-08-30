import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// archify skill (vendored from github.com/tt-a1i/archify, MIT) — port contract:
// the vendored CLI must validate every bundled example type and deliver a
// standalone HTML without any runtime dependency or network access.
// fileURLToPath 필수 — Windows에서 URL.pathname은 /C:/... 형태라 경로가 깨진다
const root = fileURLToPath(new URL("..", import.meta.url));
const SKILL = join(root, "skills", "archify");
const CLI = join(SKILL, "bin", "archify.mjs");

const EXAMPLES = [
	["lifecycle", "examples/agent-run.lifecycle.json"],
	["workflow", "examples/agent-tool-call.workflow.json"],
	["sequence", "examples/async-job-roundtrip.sequence.json"],
	["architecture", "examples/brand-aware-delivery.architecture.json"],
	["dataflow", "examples/event-stream.dataflow.json"],
];

test("archify skill is materialized into skills/ with its MIT license", () => {
	assert.equal(existsSync(CLI), true, "skills/archify/bin/archify.mjs missing — run npm run sync:skills");
	assert.equal(existsSync(join(SKILL, "LICENSE")), true, "upstream MIT LICENSE must ship with the vendored skill");
	assert.equal(
		existsSync(join(root, "shared-skills", "skills", "archify", "SKILL.md")),
		true,
		"shared-skills/skills/archify is the authoring source and must exist",
	);
});

test("vendored copy carries no remote update checker (no phone-home)", () => {
	assert.equal(existsSync(join(SKILL, "scripts", "check-update.mjs")), false);
	assert.equal(existsSync(join(SKILL, "scripts", "update-contract.mjs")), false);
});

for (const [type, example] of EXAMPLES) {
	test(`archify validate ${type} passes showcase quality`, () => {
		const res = spawnSync("node", [CLI, "validate", type, join(SKILL, example), "--quality", "showcase", "--json"], {
			encoding: "utf8",
			timeout: 60_000,
		});
		assert.equal(res.status, 0, `stderr: ${res.stderr?.slice(0, 400)}`);
		const receipt = JSON.parse(res.stdout);
		const checks = receipt.artifactChecks ?? receipt.checks;
		assert.ok(Array.isArray(checks) && checks.length >= 4, "receipt must carry artifact checks");
		for (const check of checks) assert.equal(check.ok, true, `${check.name} failed`);
	});
}

test("archify deliver produces a standalone HTML that passes archify check", () => {
	const outDir = mkdtempSync(join(tmpdir(), "archify-"));
	const html = join(outDir, "out.html");
	const deliver = spawnSync(
		"node",
		[CLI, "deliver", "workflow", join(SKILL, "examples/agent-tool-call.workflow.json"), html, "--quality", "showcase", "--json"],
		{ encoding: "utf8", timeout: 60_000 },
	);
	assert.equal(deliver.status, 0, `stderr: ${deliver.stderr?.slice(0, 400)}`);
	const receipt = JSON.parse(deliver.stdout);
	assert.equal(receipt.ok, true);
	const file = readFileSync(html, "utf8");
	assert.match(file, /<svg/);
	// 자기완결성: 외부 <script src> 로드가 없어야 한다 (웹폰트 CSS는 비동기 선택 로드로
	// 시스템 폰트 폴백이 보장되어 있으므로 허용 — 오프라인에서도 완전 동작)
	assert.doesNotMatch(file, /<script[^>]+src=["']https?:\/\//);

	const check = spawnSync("node", [CLI, "check", html], { encoding: "utf8", timeout: 60_000 });
	assert.equal(check.status, 0, `stderr: ${check.stderr?.slice(0, 400)}`);
	const checkReceipt = JSON.parse(check.stdout);
	assert.equal(checkReceipt.ok, true);
	assert.equal(checkReceipt.composition.summary.errors, 0);
	assert.equal(checkReceipt.composition.summary.warnings, 0);
});

test("materialized skills/archify matches the shared-skills authoring source", () => {
	const source = readFileSync(join(root, "shared-skills", "skills", "archify", "SKILL.md"), "utf8");
	const materialized = readFileSync(join(SKILL, "SKILL.md"), "utf8");
	assert.equal(source, materialized, "SKILL.md drift between shared-skills and skills/ — run npm run sync:skills");
});
