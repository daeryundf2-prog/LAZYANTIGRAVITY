import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

const allowedStatuses = new Set(["verified", "deferred", "removed"]);

test("#given README and skill claims #when evidence map JSON is requested #then every claim has a supported status", () => {
	const result = spawnSync("node", ["scripts/lazyantigravity-evidence-map.mjs", "--json"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);

	const report = JSON.parse(result.stdout);
	assert.equal(report.format, "lazyantigravity-evidence-map.v1");
	assert.equal(report.product, "LazyAntigravity");
	assert.ok(report.claims.length >= 10, "expected README, skill, telemetry, and evidence command claims");
	assert.deepEqual(report.summary.unknown, []);

	for (const claim of report.claims) {
		assert.equal(typeof claim.id, "string");
		assert.equal(typeof claim.source, "string");
		assert.equal(allowedStatuses.has(claim.status), true, `${claim.id} has unsupported status ${claim.status}`);
		assert.notEqual(claim.evidence.length, 0, `${claim.id} must include evidence`);
	}

	for (const id of [
		"readme.doctor-command",
		"readme.hooks-report-command",
		"readme.mcp-status-command",
		"readme.provenance-command",
		"readme.evidence-map-command",
	]) {
		assert.equal(report.claims.find((claim) => claim.id === id)?.status, "verified", `${id} must be verified`);
	}
});

test("#given unsupported evidence map args #when command runs #then it exits nonzero with usage", () => {
	const result = spawnSync("node", ["scripts/lazyantigravity-evidence-map.mjs", "--bogus"], {
		cwd: root,
		encoding: "utf8",
	});

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Usage:/);
});
