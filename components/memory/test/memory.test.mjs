import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFacts, saveFact, formatActiveMemoryContext } from "../dist/store.js";

test("saveFact and readFacts work with deduplication", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "memory-test-"));
	const testFile = join(tempDir, "facts.jsonl");

	try {
		const fact1 = saveFact("Project uses Bun for testing", "fact", testFile);
		assert.ok(fact1);
		assert.equal(fact1.content, "Project uses Bun for testing");

		// Duplicate save should return null
		const factDup = saveFact("Project uses Bun for testing", "fact", testFile);
		assert.equal(factDup, null);

		const fact2 = saveFact("Do not use arbitrary setTimeout in async tests", "gotcha", testFile);
		assert.ok(fact2);

		const facts = readFacts(testFile);
		assert.equal(facts.length, 2);
		assert.equal(facts[0].content, "Project uses Bun for testing");
		assert.equal(facts[1].content, "Do not use arbitrary setTimeout in async tests");

		const context = formatActiveMemoryContext(facts);
		assert.ok(context.includes("<project-active-memory>"));
		assert.ok(context.includes("⚠️ [GOTCHA] Do not use arbitrary setTimeout in async tests"));
		assert.ok(context.includes("📌 [FACT] Project uses Bun for testing"));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
