import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

const hephaestusPath = join(root, "components", "rules", "bundled-rules", "hephaestus.md");

test("#given bundled Hephaestus rules #when inspected #then factual claims require provenance discipline", async () => {
	// given
	const prompt = await readFile(hephaestusPath, "utf8");

	// when
	const claimSection = prompt.match(/# Claim Provenance[\s\S]*?# Intent/);

	// then
	assert.notEqual(claimSection, null);
	const text = claimSection?.[0] ?? "";
	assert.match(text, /observed[\s\S]*sourced[\s\S]*user-provided[\s\S]*inferred[\s\S]*unknown/i);
	assert.match(text, /repo state[\s\S]*build\/test status[\s\S]*deployment status[\s\S]*performance claims/i);
	assert.match(text, /Memory[\s\S]*subagent summaries[\s\S]*model recall[\s\S]*do not prove/i);
	assert.match(text, /Keep verification proportional[\s\S]*core source files[\s\S]*integration test reports/i);
	assert.match(text, /Do not re-run broad duplicate searches[\s\S]*minimal source, command, or artifact/i);
	assert.match(text, /Never fabricate verification artifacts[\s\S]*real command[\s\S]*writeFileSync/i);
	assert.match(text, /Do not refresh stale evidence[\s\S]*touch[\s\S]*metadata-only/i);
	assert.match(text, /verify it[\s\S]*label it as unverified[\s\S]*delete the claim/i);
	assert.match(text, /child-agent[\s\S]*tool-wrapper output[\s\S]*leads/i);
	assert.match(text, /Checklist entries[\s\S]*observed commands[\s\S]*paths[\s\S]*unverified/i);
	assert.match(text, /Provenance Checklist[\s\S]*Code Changes:[\s\S]*Test Result:[\s\S]*Remaining Risk:/i);
	assert.match(text, /current observations[\s\S]*memory[\s\S]*completed work[\s\S]*remaining risk/i);
	assert.match(text, /implemented locally[\s\S]*tests passed[\s\S]*pushed[\s\S]*deployed[\s\S]*production-ready/i);
});
