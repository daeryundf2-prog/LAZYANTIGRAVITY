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

test("#given bundled model catalog #when antigravity availableModels inspected #then Gemini 3.5 Flash is absent and Gemini 3.8/3.7 Flash tiers are present", async () => {
	const antigravity = await readAntigravityCatalog();
	const available = antigravity.availableModels;
	assert.equal(Array.isArray(available), true, "availableModels must be an array");

	const byId = new Map(available.map((m) => [m.modelId, m]));
	for (const tier of ["low", "medium", "high"]) {
		const dropped = `gemini-3.5-flash-${tier}`;
		assert.equal(byId.has(dropped), false, `expected ${dropped} to be dropped (3.5 Flash removed)`);
		for (const family of ["3.8", "3.7"]) {
			const id = `gemini-${family}-flash-${tier}`;
			assert.ok(byId.has(id), `expected ${id} to be present in availableModels`);
			const entry = byId.get(id);
			assert.equal(entry.provider, "google", `${id}.provider`);
			assert.equal(entry.speed, "fast", `${id}.speed`);
			assert.equal(entry.reasoningLevel, tier, `${id}.reasoningLevel`);
			assert.equal(entry.availabilitySource, "ui", `${id}.availabilitySource`);
		}
	}
});

test("#given bundled model catalog #when antigravity roles inspected #then no role recommends Gemini 3.5/3.6 Flash as its primary modelId (upgrade to 3.8 holds)", async () => {
	const antigravity = await readAntigravityCatalog();
	const roles = antigravity.roles ?? {};
	for (const [roleName, role] of Object.entries(roles)) {
		assert.ok(role.modelId, `role ${roleName} must have a modelId`);
		assert.match(
			role.modelId,
			/^gemini-3\.[78]-flash|^gemini-3\.1-pro|^claude-|^gpt-oss/,
			`role ${roleName} modelId=${role.modelId} must not recommend a 3.5/3.6 Flash tier`,
		);
		assert.doesNotMatch(
			role.modelId,
			/gemini-3\.(5|6)-flash/,
			`role ${roleName} must NOT pin a 3.5/3.6 Flash modelId as primary`,
		);
	}
});

test("#given bundled model catalog #when antigravity roles inspected #then Gemini 3.8 Flash is plan+code default (planner/default/worker/current)", async () => {
	const antigravity = await readAntigravityCatalog();
	assert.equal(antigravity.current?.model, "gemini-3.8-flash-high");
	assert.equal(antigravity.roles?.planner?.modelId, "gemini-3.8-flash-high");
	assert.equal(antigravity.roles?.default?.modelId, "gemini-3.8-flash-high");
	assert.equal(antigravity.roles?.worker?.modelId, "gemini-3.8-flash-high");
	assert.equal(antigravity.roles?.researcher?.modelId, "gemini-3.8-flash-high");
	assert.equal(antigravity.roles?.fast?.modelId, "gemini-3.8-flash-medium");
	assert.equal(antigravity.roles?.verifier?.modelId, "gemini-3.1-pro-high");
	assert.equal(antigravity.canAutoRoute, false);
	assert.equal(antigravity.canTierRoute, true);
	assert.equal(antigravity.hostEnforced, false);
	assert.equal(antigravity.routingMode, "agent-tier-hint");
	assert.equal(antigravity.tierMap?.verifier, "pro");
});

test("#given bundled model catalog #when antigravity perRoleRouting inspected #then host auto-routing is unsupported and Model is an agent hint", async () => {
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));
	const routing = catalog.perRoleRouting?.antigravity;
	assert.equal(routing?.supported, false);
	assert.equal(routing?.hostEnforced, false);
	assert.equal(routing?.routingMode, "agent-tier-hint");
});

test("#given antigravity plugin install #when ulw-loop CLI path resolved from PLUGIN_ROOT #then help exits zero", async () => {
	const { spawnSync } = await import("node:child_process");
	const cli = join(root, "components", "ulw-loop", "dist", "cli.js");
	const result = spawnSync(process.execPath, [cli, "ulw-loop", "help"], {
		encoding: "utf8",
		env: { ...process.env, PLUGIN_ROOT: root },
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("#given ulw-loop skill pack #when antigravity workflow inspected #then spawn_agent is not the AG default path", async () => {
	const skill = await readFile(join(root, "skills", "ulw-loop", "SKILL.md"), "utf8");
	const workflow = await readFile(join(root, "skills", "ulw-loop", "references", "full-workflow.md"), "utf8");
	assert.match(skill, /invoke_subagent/);
	assert.match(skill, /PLUGIN_ROOT|Windows PowerShell|Antigravity Tool Mapping/);
	assert.doesNotMatch(skill, /## Codex Tool Mapping\n\n\| Workflow intent \| Codex tool \|/);
	assert.match(workflow, /PLUGIN_ROOT/);
	assert.match(workflow, /Windows PowerShell/);
	assert.match(workflow, /gemini-3\.8|Gemini 3\.8 Flash/);
	assert.match(workflow, /invoke_subagent/);
	assert.doesNotMatch(workflow, /Codex-only goal table/);
	assert.doesNotMatch(workflow, /spawn_agent\/wait_agent/);
	assert.doesNotMatch(workflow, /--codex-goal-json <snapshot>/);
});

test("#given bundled model catalog #when antigravity planner inspected #then Claude Opus is fallback-only not primary", async () => {
	const antigravity = await readAntigravityCatalog();
	assert.notEqual(antigravity.roles?.planner?.modelId, "claude-opus-4.6");
	assert.ok((antigravity.roles?.planner?.fallbackChain ?? []).includes("claude-opus-4.6"));
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