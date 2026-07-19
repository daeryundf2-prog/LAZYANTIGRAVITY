import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

test("#given Reicon official metadata #when OSS icons report JSON is requested #then LazyAntigravity receives a safe candidate recommendation", () => {
	const result = spawnSync("node", ["scripts/lazyantigravity-oss-icons-report.mjs", "--json"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);

	const report = JSON.parse(result.stdout);
	assert.equal(report.format, "lazyantigravity-oss-icons-report.v1");
	assert.equal(report.product, "LazyAntigravity");
	assert.match(report.source_policy, /does not install or fetch packages at runtime/);
	assert.deepEqual(report.summary.recommended_now, ["oss-icons-report"]);

	const reicon = report.candidates.find((candidate) => candidate.id === "reicon");
	assert.ok(reicon, "reicon candidate must be present");
	assert.equal(reicon.package, "reicon");
	assert.equal(reicon.packages.core.version, "1.0.0");
	assert.equal(reicon.packages.react.name, "reicon-react");
	assert.equal(reicon.packages.vue.name, "reicon-vue");
	assert.equal(reicon.packages.svelte.name, "reicon-svelte");
	assert.equal(reicon.license.user_term, "MI");
	assert.equal(reicon.license.normalized, "MIT");
	assert.equal(reicon.license.official, "MIT");
	assert.equal(reicon.recommendation.status, "add-report-now");
	assert.equal(reicon.integration_points.find((point) => point.id === "runtime-dependency")?.status, "deferred");
	assert.ok(reicon.risk_notes.some((note) => note.includes("Solar Icons") && note.includes("Zappicon")));
	assert.ok(reicon.sources.some((source) => source.url === "https://github.com/dqev/reicon"));
	assert.ok(reicon.sources.some((source) => source.url === "https://www.npmjs.com/package/reicon"));
});

test("#given an unknown icon candidate #when OSS icons report is requested #then command rejects it without successful output", () => {
	const result = spawnSync("node", ["scripts/lazyantigravity-oss-icons-report.mjs", "--candidate", "unknown", "--json"], {
		cwd: root,
		encoding: "utf8",
	});

	assert.notEqual(result.status, 0);
	assert.equal(result.stdout, "");
	assert.match(result.stderr, /Unknown candidate: unknown/);
});
