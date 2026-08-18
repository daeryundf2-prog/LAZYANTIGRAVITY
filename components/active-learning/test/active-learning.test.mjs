import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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

test("evolveRules reads failures, extracts patterns, and promotes to facts.jsonl", () => {
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
		assert.equal(report.promotedGotchas.length, 1);

		const memPath = join(tempDir, ".lazyantigravity", "memory", "facts.jsonl");
		const memContent = readFileSync(memPath, "utf8");
		assert.ok(memContent.includes("git_push"));
		assert.ok(memContent.includes("[자가학습 Gotcha]"));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
