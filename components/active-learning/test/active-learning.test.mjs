import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractFailurePatterns } from "../dist/analyzer.js";
import { evolveRules } from "../dist/evolver.js";

test("extractFailurePatterns clusters repetitive errors and calculates confidence", () => {
	const events = [
		{ id: "1", timestamp: Date.now(), eventType: "tool_error", toolName: "replace_file_content", errorMessage: "TargetContent not found in file" },
		{ id: "2", timestamp: Date.now(), eventType: "tool_error", toolName: "replace_file_content", errorMessage: "TargetContent not found in file" },
		{ id: "3", timestamp: Date.now(), eventType: "tool_error", toolName: "run_command", errorMessage: "Command timed out" },
	];

	const gotchas = extractFailurePatterns(events);
	assert.equal(gotchas.length, 1);
	assert.ok(gotchas[0].pattern.includes("replace_file_content"));
	assert.equal(gotchas[0].occurrences, 2);
	assert.ok(gotchas[0].confidence >= 0.7);
});

test("evolveRules is analyze-only by default and does not promote to facts.jsonl", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "active-learn-test-"));
	try {
		const telDir = join(tempDir, ".lazyantigravity", "telemetry");
		mkdirSync(telDir, { recursive: true });

		const mockFailures = [
			{ eventType: "tool_error", toolName: "git_push", errorMessage: "Remote rejected: main protected branch" },
			{ eventType: "tool_error", toolName: "git_push", errorMessage: "Remote rejected: main protected branch" },
		];

		writeFileSync(join(telDir, "events.jsonl"), mockFailures.map((f) => JSON.stringify(f)).join("\n") + "\n", "utf8");

		const report = evolveRules(tempDir);
		assert.equal(report.analyzedEvents, 2);
		assert.equal(report.promotedGotchas.length, 0);

		const memPath = join(tempDir, ".lazyantigravity", "memory", "facts.jsonl");
		assert.equal(existsSync(memPath), false);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
