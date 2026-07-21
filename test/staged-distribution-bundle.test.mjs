import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson, persistBundle, verifyBundle } from "../scripts/staged-distribution/bundle.mjs";

test("[todo15.bundle.closed] bundle is canonical, hash-valid, and rejects alteration or missing artifacts", () => {
	assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 1 } }), "{\"a\":{\"x\":1,\"y\":2},\"z\":1}");
	const temp = mkdtempSync(join(tmpdir(), "todo15-bundle-"));
	try {
		const result = persistBundle({
			bundleDir: temp,
			artifacts: { "reconstruction.json": { schemaVersion: 1, subjectFingerprint: "a".repeat(64), logicalFiles: [] } },
			metadata: { subjectFingerprint: "a".repeat(64), logicalFingerprint: "b".repeat(64) },
		});
		assert.equal(verifyBundle(temp).bundleHash, result.bundleHash);
		writeFileSync(join(temp, "reconstruction.json"), "{}\n");
		assert.throws(() => verifyBundle(temp), /hash/i);
		rmSync(join(temp, "reconstruction.json"));
		assert.throws(() => verifyBundle(temp), /missing/i);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});

test("[todo15.bundle.schema] bundle manifest has no undeclared fields or self-referential artifact hash", () => {
	const temp = mkdtempSync(join(tmpdir(), "todo15-bundle-schema-"));
	try {
		persistBundle({ bundleDir: temp, artifacts: {}, metadata: { subjectFingerprint: "a".repeat(64), logicalFingerprint: "b".repeat(64) } });
		const manifest = JSON.parse(readFileSync(join(temp, "bundle-manifest.json"), "utf8"));
		assert.deepEqual(Object.keys(manifest).sort(), ["artifacts", "bundleVersion", "createdAt", "logicalFingerprint", "subjectFingerprint"]);
		assert.equal("bundle-manifest.json" in manifest.artifacts, false);
		assert.equal("bundle.sha256" in manifest.artifacts, false);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});
