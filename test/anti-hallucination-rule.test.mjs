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
	assert.match(text, /verify it[\s\S]*label it as unverified[\s\S]*delete the claim/i);
	assert.match(text, /child-agent[\s\S]*tool-wrapper output[\s\S]*leads/i);
	assert.match(text, /current observations[\s\S]*memory[\s\S]*completed work[\s\S]*remaining risk/i);
	assert.match(text, /implemented locally[\s\S]*tests passed[\s\S]*pushed[\s\S]*deployed[\s\S]*production-ready/i);
	assert.match(text, /Strict Abstention & Fallback Token Protocol/i);
	assert.match(text, /\[INSUFFICIENT_DATA/i);
	assert.match(text, /Evidence-First Attributed QA Protocol/i);
	assert.match(text, /<evidence>/i);
	assert.match(text, /LangExtract Span-Level Grounding & Verbatim Quote/i);
	assert.match(text, /Thinking Budget 2-Phase Cognitive Decoupling/i);
	assert.match(text, /Phase 1 \(Thinking Trace\)[\s\S]*Phase 2 \(Response Formulation\)/i);
	assert.match(text, /Korean Government Agency & Ministry Hallucination Ban/i);
	assert.match(text, /정보통신부[\s\S]*문화공보부[\s\S]*사이버수사처/i);
	assert.match(text, /Korean Historical Events & Treaties Hallucination Ban/i);
	assert.match(text, /갑오개혁 4차[\s\S]*을사조약[\s\S]*동학농민운동/i);
	assert.match(text, /제四차 갑오개혁|第4次 甲午改革/i);
	assert.match(text, /Korean Academic Citations & Authorship Hallucination Ban/i);
	assert.match(text, /대한인공지능법학회지[\s\S]*한국사이버포렌식학회논문집/i);
	assert.match(text, /Impossible Judicial Procedures Hallucination Ban/i);
	assert.match(text, /약식명령[\s\S]*대검찰청/i);
	assert.match(text, /영장 직접 청구/i);
	assert.match(text, /헌법재판소[\s\S]*징역형/i);
	assert.match(text, /형사소송[\s\S]*원고/i);
});

