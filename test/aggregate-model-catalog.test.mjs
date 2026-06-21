import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

test("#given bundled model catalog #when inspected #then default verifier and worker roles are pinned", async () => {
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));
	const target = catalog.codex || catalog;

	assert.equal(target.current.model, "gpt-5.5");
	assert.equal(target.current.model_context_window, 400000);
	assert.equal(target.current.model_reasoning_effort, "high");
	assert.equal(target.current.plan_mode_reasoning_effort, "xhigh");
	if (catalog.codex) {
		assert.equal(target.roles.default.modelId, "gpt-5.5");
		assert.equal(target.roles.default.reasoningLevel, "high");
		assert.deepEqual(target.roles.verifier, {
			modelId: "gpt-5.5",
			displayName: "GPT-5.5",
			reasoningLevel: "xhigh",
			purpose: "코드 검증 — 최고 추론 설정",
			fallbackChain: [],
			availabilitySource: "config",
		});
		assert.deepEqual(target.roles.worker, {
			modelId: "gpt-5.5",
			displayName: "GPT-5.5",
			reasoningLevel: "high",
			purpose: "서브에이전트 작업 — 품질/속도 균형",
			fallbackChain: [],
			availabilitySource: "config",
		});
	} else {
		assert.deepEqual(target.roles.default, target.current);
		assert.deepEqual(target.roles.verifier, {
			model: "gpt-5.5",
			model_reasoning_effort: "xhigh",
		});
		assert.deepEqual(target.roles.worker, {
			model: "gpt-5.5",
			model_reasoning_effort: "high",
		});
	}
});

test("#given bundled model catalog #when inspected #then no role or managed preset uses pure GPT-5.4", async () => {
	const catalog = JSON.parse(await readFile(join(root, "model-catalog.json"), "utf8"));
	const target = catalog.codex || catalog;

	const roleModels = Object.values(target.roles).map((role) => role.model || role.modelId);
	const managedModels = target.managedProfiles.map((profile) => profile.match.model);

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
