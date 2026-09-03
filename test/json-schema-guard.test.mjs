import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("../scripts/json_schema_guard.mjs", import.meta.url));

function runGuard(stdinPayload) {
	return spawnSync("node", [GUARD], {
		input: stdinPayload,
		encoding: "utf8",
	});
}

test("json_schema_guard passes clean valid JSON (Feature 07)", () => {
	const dir = mkdtempSync(join(tmpdir(), "jsonguard-"));
	const file = join(dir, "valid.json");
	writeFileSync(
		file,
		JSON.stringify({
			name: "my-package",
			version: "1.0.0",
			url: "https://example.com/api",
			created_at: "2026-09-03T12:00:00Z"
		}),
		"utf8"
	);

	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 0, res.stderr);
});

test("json_schema_guard blocks malformed syntax with actionable error", () => {
	const dir = mkdtempSync(join(tmpdir(), "jsonguard-"));
	const file = join(dir, "broken.json");
	writeFileSync(file, "{ name: 'unquoted', }", "utf8");

	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 1);
	assert.match(res.stderr, /Malformed JSON Syntax/i);
	assert.match(res.stderr, /INSTRUCTOR SELF-CORRECTION GUIDANCE/i);
});

test("json_schema_guard blocks invalid URL protocol in URL fields", () => {
	const dir = mkdtempSync(join(tmpdir(), "jsonguard-"));
	const file = join(dir, "bad_url.json");
	writeFileSync(
		file,
		JSON.stringify({
			name: "test",
			version: "1.0.0",
			url: "ftp_invalid_protocol"
		}),
		"utf8"
	);

	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 1);
	assert.match(res.stderr, /valid_url_protocol/i);
});

test("json_schema_guard blocks invalid ISO date in date fields", () => {
	const dir = mkdtempSync(join(tmpdir(), "jsonguard-"));
	const file = join(dir, "bad_date.json");
	writeFileSync(
		file,
		JSON.stringify({
			name: "test",
			version: "1.0.0",
			timestamp: "not-a-valid-date-timestamp"
		}),
		"utf8"
	);

	const res = runGuard(JSON.stringify({ tool_input: { file_path: file } }));
	assert.equal(res.status, 1);
	assert.match(res.stderr, /valid_iso_date/i);
});

test("json_schema_guard CLI --check mode detects failures", () => {
	const dir = mkdtempSync(join(tmpdir(), "jsonguard-"));
	const badFile = join(dir, "bad.json");
	writeFileSync(badFile, "{ bad: json", "utf8");

	const res = spawnSync("node", [GUARD, "--check", badFile], { encoding: "utf8" });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /FAIL/);
});
