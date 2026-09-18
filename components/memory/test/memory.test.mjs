import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFacts, saveFact, formatActiveMemoryContext } from "../dist/store.js";
import { searchMemoryFacts } from "../dist/search.js";

test("metadata defaults to unverified and rejects approval without reviewer evidence", () => {
	const dir = mkdtempSync(join(tmpdir(), "memory-metadata-"));
	try {
		const file = join(dir, "facts.jsonl");
		const fact = saveFact("Working assumption", "fact", file);
		assert.equal(fact.verificationStatus, "unverified");
		assert.equal(fact.review, undefined);
		assert.throws(() => saveFact("Unproven approval", "fact", file, { review: { decision: "approved" } }), /review/i);
		assert.equal(readFacts(file).length, 1);
		writeFileSync(file, JSON.stringify({ content: "Legacy fact", status: "verified", review: { decision: "approved" } }) + "\n");
		const legacy = readFacts(file)[0];
		assert.equal(legacy.verificationStatus, "unverified");
		assert.equal(legacy.review, undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("source and reviewer evidence round-trip without promoting facts to verified", () => {
	const dir = mkdtempSync(join(tmpdir(), "memory-review-"));
	try {
		const file = join(dir, "facts.jsonl");
		const content = "Reviewed working assumption";
		const hash = (value) => createHash("sha256").update(value).digest("hex");
		const receipt = JSON.stringify({ reviewer: "test-reviewer", reviewedAt: "2026-01-01T00:00:00.000Z", decision: "approved", contentSha256: hash(content) });
		writeFileSync(join(dir, "review.json"), receipt);
		const metadata = { source: "fixture specification", review: { reviewer: "test-reviewer", reviewedAt: "2026-01-01T00:00:00.000Z", decision: "approved", evidence: { file: "review.json", sha256: hash(receipt) } } };
		const saved = saveFact(content, "fact", file, metadata);
		assert.equal(saved.verificationStatus, "unverified");
		assert.deepEqual(readFacts(file)[0], saved);
		assert.equal(saved.source, metadata.source);
		assert.equal(saved.review.decision, "approved");
		assert.throws(() => saveFact("Changed fact", "fact", file, metadata), /review/i);
		assert.throws(() => saveFact(content, "fact", file, { ...metadata, review: { ...metadata.review, reviewer: "impostor" } }), /review/i);
		writeFileSync(join(dir, "review.json"), "tampered");
		const reread = readFacts(file)[0];
		assert.equal(reread.review, undefined);
		assert.equal(reread.verificationStatus, "unverified");
		assert.match(formatActiveMemoryContext([reread]), /not verified evidence/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("search does not expose raw approval or verified claims", () => {
	const dir = mkdtempSync(join(tmpdir(), "memory-search-review-"));
	try {
		mkdirSync(join(dir, ".lazyantigravity/memory"), { recursive: true });
		writeFileSync(join(dir, ".lazyantigravity/memory/facts.jsonl"), JSON.stringify({ id: "fixture", category: "fact", content: "Claimed fact", verificationStatus: "verified", review: { decision: "approved" } }));
		const fact = searchMemoryFacts(dir, "claimed").matchedFacts[0];
		assert.equal(fact.verificationStatus, "unverified");
		assert.equal(fact.review, undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("review evidence rejects traversal, symlink escapes, missing receipts and future dates", () => {
	const dir = mkdtempSync(join(tmpdir(), "memory-review-boundary-"));
	try {
		mkdirSync(join(dir, "facts"));
		const file = join(dir, "facts/facts.jsonl");
		const content = "Working fact";
		const hash = (value) => createHash("sha256").update(value).digest("hex");
		const review = { reviewer: "fixture-reviewer", reviewedAt: "2026-01-01T00:00:00.000Z", decision: "rejected" };
		const receipt = JSON.stringify({ ...review, contentSha256: hash(content) });
		writeFileSync(join(dir, "receipt.json"), receipt);
		symlinkSync(join(dir, "receipt.json"), join(dir, "facts/link.json"));
		for (const path of ["../receipt.json", "link.json", "missing.json", join(dir, "receipt.json")]) {
			assert.throws(() => saveFact(content, "fact", file, { review: { ...review, evidence: { file: path, sha256: hash(receipt) } } }), /review/i);
		}
		writeFileSync(join(dir, "facts/receipt.json"), receipt);
		assert.throws(() => saveFact(content, "fact", file, { review: { ...review, reviewedAt: "2999-01-01T00:00:00.000Z", evidence: { file: "receipt.json", sha256: hash(receipt) } } }), /review/i);
		const saved = saveFact(content, "fact", file, { review: { ...review, evidence: { file: "receipt.json", sha256: hash(receipt) } } });
		assert.equal(saved.review.decision, "rejected");
		assert.equal(saved.verificationStatus, "unverified");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

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
		assert.match(context, /editable working facts/);
		assert.match(context, /not verified evidence/);
		assert.doesNotMatch(context, /These verified/);
		assert.ok(context.includes("⚠️ [GOTCHA] Do not use arbitrary setTimeout in async tests"));
		assert.ok(context.includes("📌 [FACT] Project uses Bun for testing"));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
