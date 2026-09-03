import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = join(ROOT, "korean-law-mcp", "dist", "cli.js");

function callTool(name, args) {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
		encoding: "utf8",
		timeout: 15000,
		cwd: ROOT,
	});
	assert.equal(res.status, 0, res.stderr);
	const output = JSON.parse(res.stdout);
	assert.ok(output.result, JSON.stringify(output));
	return JSON.parse(output.result.content[0].text);
}

test("korean-law-mcp exposes lookup_statute and lookup_precedent tools (Feature 14)", () => {
	const res = spawnSync(process.execPath, [SERVER, "mcp"], {
		input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
		encoding: "utf8",
		timeout: 15000,
		cwd: ROOT,
	});
	assert.equal(res.status, 0, res.stderr);
	const tools = JSON.parse(res.stdout).result.tools.map((t) => t.name);
	assert.deepEqual(tools, ["lookup_statute", "lookup_precedent"]);
});

test("lookup_statute retrieves verified civil and PII statute articles", () => {
	const resCivil = callTool("lookup_statute", { statute_name: "민법", article_number: "750" });
	assert.equal(resCivil.ok, true);
	assert.equal(resCivil.grounding_status, "VERIFIED_PRIMARY_STATUTE");
	assert.match(resCivil.text, /불법행위의 내용/);

	const resPii = callTool("lookup_statute", { statute_name: "개인정보보호법", article_number: "29" });
	assert.equal(resPii.ok, true);
	assert.match(resPii.text, /안전조치의무/);

	const resNetSub = callTool("lookup_statute", { statute_name: "정보통신망법", article_number: "44조의7" });
	assert.equal(resNetSub.ok, true);
	assert.match(resNetSub.text, /불법정보의 유통금지/);
});

test("lookup_statute prevents hallucination with [INSUFFICIENT_DATA] on non-existent provisions", () => {
	const res = callTool("lookup_statute", { statute_name: "민법", article_number: "99999" });
	assert.equal(res.ok, false);
	assert.equal(res.grounding_status, "UNVERIFIED");
	assert.match(res.error, /INSUFFICIENT_DATA/);
});

test("lookup_precedent verifies landmark precedent and validates Korean court case formatting", () => {
	const resLandmark = callTool("lookup_precedent", { case_number: "2017다220744" });
	assert.equal(resLandmark.ok, true);
	assert.equal(resLandmark.grounding_status, "VERIFIED_PRIMARY_PRECEDENT");
	assert.match(resLandmark.precedent.name, /위약벌/);

	const resSpaced = callTool("lookup_precedent", { case_number: "2017 다 220744" });
	assert.equal(resSpaced.ok, true);
	assert.equal(resSpaced.grounding_status, "VERIFIED_PRIMARY_PRECEDENT");
	assert.match(resSpaced.precedent.name, /위약벌/);

	const resValid = callTool("lookup_precedent", { case_number: "2023다99881" });
	assert.equal(resValid.ok, true);
	assert.equal(resValid.format_valid, true);
	assert.equal(resValid.court_code_info.jurisdiction, "대법원 민사상고");
});

test("lookup_precedent rejects invalid case number format with [INSUFFICIENT_DATA]", () => {
	const res = callTool("lookup_precedent", { case_number: "fake_court_case_123" });
	assert.equal(res.ok, false);
	assert.match(res.error, /INSUFFICIENT_DATA/);
});

