import assert from "node:assert/strict";
import test from "node:test";
import { runEnterpriseHealthCheck } from "../scripts/enterprise_pipeline_health_check.mjs";

test("#given enterprise pipeline health check #when executed #then all 3 layers pass with 100/100 score", async () => {
	const report = await runEnterpriseHealthCheck({ crossRepo: false });

	assert.equal(report.status, "PASS");
	assert.equal(report.score, 100);
	assert.equal(report.max_score, 100);
	assert.equal(report.checks.length, 10);

	for (const check of report.checks) {
		assert.equal(
			check.status,
			"PASS",
			`Expected check ${check.id} (${check.name}) to PASS, but got ${check.status}: ${check.detail}`
		);
	}
});

test("#given enterprise pipeline health check with cross-repo #when executed #then cross-repo factuality gates are verified", async () => {
	const report = await runEnterpriseHealthCheck({ crossRepo: true });

	assert.equal(report.status, "PASS");
	assert.equal(report.score, 100);
	if (report.cross_repo.lazyforensic) {
		assert.equal(report.cross_repo.lazyforensic.status, "PASS");
		assert.equal(report.cross_repo.lazyforensic.score, 100);
	}
	if (report.cross_repo.lazyothers) {
		assert.equal(report.cross_repo.lazyothers.status, "PASS");
		assert.equal(report.cross_repo.lazyothers.score, 100);
	}
});
