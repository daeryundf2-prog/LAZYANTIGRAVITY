import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

test("#given bundled model catalog #when inspected #then Antigravity Flash defaults are pinned at top-level and antigravity section", async () => {
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));

	assert.equal(catalog.current.model, "gemini-3.7-flash-high");
	assert.equal(catalog.current.model_context_window, 1048576);
	assert.equal(catalog.current.model_reasoning_effort, "high");
	assert.equal(catalog.current.plan_mode_reasoning_effort, "high");
	assert.deepEqual(catalog.roles.default, catalog.current);
	assert.deepEqual(catalog.roles.verifier, {
		model: "gemini-3.1-pro-high",
		model_reasoning_effort: "high",
	});
	assert.deepEqual(catalog.roles.worker, {
		model: "gemini-3.7-flash-high",
		model_reasoning_effort: "high",
	});
	assert.equal(catalog.antigravity.canTierRoute, true);
	assert.equal(catalog.antigravity.hostEnforced, false);
	assert.equal(catalog.antigravity.routingMode, "agent-tier-hint");
	assert.equal(catalog.antigravity.tierMap.verifier, "pro");
	assert.equal(catalog.antigravity.roles.default.modelId, "gemini-3.7-flash-high");
	assert.equal(catalog.perRoleRouting.antigravity.supported, false);
	assert.equal(catalog.perRoleRouting.antigravity.routingMode, "agent-tier-hint");
});

test("#given bundled model catalog #when inspected #then no role or managed preset uses pure GPT-5.4", async () => {
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));

	const roleModels = Object.values(catalog.roles).map((role) => role.model);
	assert.deepEqual(catalog.managedProfiles, []);
	const managedModels = (catalog.codex?.managedProfiles ?? []).map((profile) => profile.match.model);

	assert.equal([...roleModels, ...managedModels].includes("gpt-5.4"), false);
});

test("#given Codex-facing orchestration surfaces #when inspected #then retired ChatGPT-account model names are not recommended", async () => {
	const promptFiles = [
		join(root, "skills", "ulw-loop", "references", "full-workflow.md"),
		join(root, "components", "ulw-loop", "skills", "ulw-loop", "references", "full-workflow.md"),
		join(root, "components", "ultrawork", "README.md"),
		join(root, "components", "ultrawork", "CHANGELOG.md"),
		join(root, "components", "rules", "src", "post-compact-budget.ts"),
	];

	const staleReferences = [];
	for (const promptPath of promptFiles) {
		const content = await readFile(promptPath, "utf8");
		if (/gpt-5\.(?:2|3-codex|4(?!-mini))/i.test(content)) {
			staleReferences.push(`${basename(dirname(promptPath))}/${basename(promptPath)}`);
		}
	}

	assert.deepEqual(staleReferences, []);
});
