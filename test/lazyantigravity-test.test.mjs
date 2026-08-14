import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

const REASONING_LEVELS = new Set(["low", "medium", "high", "thinking"]);

async function readAntigravityCatalog() {
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));
	return catalog.antigravity;
}

test("#given bundled model catalog #when antigravity availableModels inspected #then Gemini 3.5 Flash tiers are absent and Gemini 3.7 Flash tiers are present (3.7-only)", async () => {
	const antigravity = await readAntigravityCatalog();
	const available = antigravity.availableModels;
	assert.equal(Array.isArray(available), true, "availableModels must be an array");

	const byId = new Map(available.map((m) => [m.modelId, m]));
	for (const tier of ["low", "medium", "high"]) {
		const dropped = `gemini-3.5-flash-${tier}`;
		assert.equal(byId.has(dropped), false, `expected ${dropped} to be dropped (3.5 Flash removed)`);
		const id = `gemini-3.7-flash-${tier}`;
		assert.ok(byId.has(id), `expected ${id} to be present in availableModels (3.7-only)`);
		const entry = byId.get(id);
		assert.equal(entry.provider, "google", `${id}.provider`);
		assert.equal(entry.speed, "fast", `${id}.speed`);
		assert.equal(entry.reasoningLevel, tier, `${id}.reasoningLevel`);
		assert.equal(entry.availabilitySource, "ui", `${id}.availabilitySource`);
	}
});

test("#given bundled model catalog #when antigravity roles inspected #then no role recommends Gemini 3.5/3.6 Flash as its primary modelId (upgrade to 3.7 holds)", async () => {
	const antigravity = await readAntigravityCatalog();
	const roles = antigravity.roles ?? {};
	for (const [roleName, role] of Object.entries(roles)) {
		assert.ok(role.modelId, `role ${roleName} must have a modelId`);
		assert.match(
			role.modelId,
			/^gemini-3\.7-flash|^gemini-3\.1-pro|^claude-|^gpt-oss/,
			`role ${roleName} modelId=${role.modelId} must not recommend a 3.5/3.6 Flash tier`,
		);
		assert.doesNotMatch(
			role.modelId,
			/gemini-3\.(5|6)-flash/,
			`role ${roleName} must NOT pin a 3.5/3.6 Flash modelId as primary`,
		);
	}
});

test("#given bundled model catalog #when antigravity coding roles inspected #then Gemini 3.7 Flash is the main coder (default/worker/current)", async () => {
	const antigravity = await readAntigravityCatalog();
	assert.equal(antigravity.current?.model, "gemini-3.7-flash-high");
	assert.equal(antigravity.roles?.default?.modelId, "gemini-3.7-flash-high");
	assert.equal(antigravity.roles?.worker?.modelId, "gemini-3.7-flash-high");
	assert.equal(antigravity.roles?.researcher?.modelId, "gemini-3.7-flash-high");
	assert.equal(antigravity.roles?.fast?.modelId, "gemini-3.7-flash-medium");
	assert.equal(antigravity.roles?.verifier?.modelId, "gemini-3.1-pro-high");
	assert.equal(antigravity.canAutoRoute, false);
	assert.equal(antigravity.routingMode, "hint-only");
});

test("#given bundled model catalog #when antigravity fallback chains inspected #then every chain entry resolves to a known available model or a role modelId", async () => {
	const antigravity = await readAntigravityCatalog();
	const available = antigravity.availableModels ?? [];
	const roleModelIds = new Set(Object.values(antigravity.roles ?? {}).map((r) => r.modelId));
	const known = new Set([...available.map((m) => m.modelId), ...roleModelIds]);

	const unresolved = [];
	for (const [roleName, role] of Object.entries(antigravity.roles ?? {})) {
		for (const id of role.fallbackChain ?? []) {
			if (!known.has(id)) {
				unresolved.push({ role: roleName, fallback: id });
			}
		}
	}
	assert.deepEqual(unresolved, [], "every fallbackChain id must reference an available model or a role modelId");
});

test("#given bundled model catalog #when antigravity availableModels inspected #then entries are well-formed and reasoning levels are valid", async () => {
	const antigravity = await readAntigravityCatalog();
	const seen = new Set();
	for (const m of antigravity.availableModels ?? []) {
		assert.ok(m.modelId, `entry missing modelId: ${JSON.stringify(m)}`);
		assert.ok(m.displayName, `${m.modelId} missing displayName`);
		assert.ok(m.provider, `${m.modelId} missing provider`);
		assert.ok(REASONING_LEVELS.has(m.reasoningLevel),
			`${m.modelId} has invalid reasoningLevel=${m.reasoningLevel}`);
		assert.ok(["fast", "moderate", "slow"].includes(m.speed),
			`${m.modelId} has invalid speed=${m.speed}`);
		assert.equal(m.availabilitySource, "ui", `${m.modelId}.availabilitySource`);
		assert.ok(!seen.has(m.modelId), `duplicate modelId in availableModels: ${m.modelId}`);
		seen.add(m.modelId);
	}
});