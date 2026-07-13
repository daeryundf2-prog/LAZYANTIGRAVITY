import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";
import {
	MODEL_ROUTING_CAPABILITY,
	detectRuntime,
	getRuntimeConfig,
} from "../scripts/runtime-adapter.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const expectedCapability = {
	canAutoRoute: false,
	selectionMode: "user-managed",
	inheritanceGuaranteed: false,
};

function findSpeculativeModelClaims(content) {
	const patterns = [
		/\bmodelId\b/i,
		/\bgemini-[a-z0-9.*-]+-(?:low|medium|high)\b/i,
		/\bclaude-(?:opus|sonnet|haiku)-\d[\w.-]*\b/i,
		/\bcanAutoRoute\s*[:=]\s*true\b/i,
		/\bfallbackChain\b|\b(?:fallback|failover)\s+(?:chain|route|model)\b/i,
		/\b(?:claude|gemini|gpt(?:-|\s))\b[^\r\n]{0,120}\b(?:inherit(?:ance|ed|s)?|switch(?:ing|es|ed)?|recommend(?:ed|ation)?|rout(?:e|ed|ing))\b/i,
		/\b(?:inherit(?:ance|ed|s)?|switch(?:ing|es|ed)?|recommend(?:ed|ation)?|rout(?:e|ed|ing))\b[^\r\n]{0,120}\b(?:claude|gemini|gpt(?:-|\s))\b/i,
	];
	return patterns.flatMap((pattern) => content.match(pattern)?.[0] ?? []);
}

test("[todo14.baseline] #given explicit runtime inputs #when detected #then existing detection behavior is preserved", () => {
	assert.equal(detectRuntime({ OMO_FORCE_RUNTIME: "codex" }), "codex");
	assert.equal(detectRuntime({ OMO_FORCE_RUNTIME: "antigravity" }), "antigravity");
	assert.equal(detectRuntime({ PLUGIN_ROOT: "C:/fixture/.gemini/extensions/lazyantigravity" }), "antigravity");
	assert.equal(detectRuntime({ GEMINI_HOME: "C:/fixture/gemini" }), "antigravity");
});

test("[todo14.baseline] #given both runtimes #when configured #then every non-model field remains stable", () => {
	const codex = getRuntimeConfig({ OMO_FORCE_RUNTIME: "codex", CODEX_HOME: "C:/fixture/codex" });
	const antigravity = getRuntimeConfig({ OMO_FORCE_RUNTIME: "antigravity", GEMINI_HOME: "C:/fixture/gemini" });

	assert.deepEqual({ ...codex, modelRouting: undefined }, {
		runtime: "codex",
		productName: "LazyCodex",
		homePath: "C:/fixture/codex",
		configFormat: "toml",
		sessionEnvKeys: ["OMO_ULW_LOOP_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID"],
		autoUpdateEnabled: false,
		configMigrationEnabled: false,
		modelRouting: undefined,
	});
	assert.deepEqual({ ...antigravity, modelRouting: undefined }, {
		runtime: "antigravity",
		productName: "LazyAntigravity",
		homePath: "C:/fixture/gemini",
		configFormat: "json",
		sessionEnvKeys: [
			"OMO_ULW_LOOP_SESSION_ID", "ANTIGRAVITY_SESSION_ID", "GEMINI_SESSION_ID",
			"CODEX_SESSION_ID", "CODEX_THREAD_ID",
		],
		autoUpdateEnabled: false,
		configMigrationEnabled: false,
		modelRouting: undefined,
	});
});

test("[todo14.catalog-retirement] #given repository root #when inspected #then speculative catalog is absent", () => {
	assert.equal(existsSync(join(root, "model-catalog.json")), false);
});

test("[todo14.runtime-hint] #given workspace runtime metadata #when inspected #then Antigravity is the only target", async () => {
	const hint = JSON.parse(await readFile(join(root, ".runtime-hint.json"), "utf8"));
	assert.deepEqual(hint, { target: "antigravity" });
});

test("[todo14.static-capability] #given either runtime #when configured #then exact frozen user-managed capability is returned", () => {
	assert.deepEqual(MODEL_ROUTING_CAPABILITY, expectedCapability);
	assert.equal(Object.isFrozen(MODEL_ROUTING_CAPABILITY), true);
	for (const runtime of ["codex", "antigravity"]) {
		const config = getRuntimeConfig({ OMO_FORCE_RUNTIME: runtime });
		assert.equal(config.modelRouting, MODEL_ROUTING_CAPABILITY);
		assert.equal(config.autoUpdateEnabled, false);
		assert.equal(config.configMigrationEnabled, false);
		assert.equal("modelCatalogKey" in config, false);
	}
});

test("[todo14.no-model-io] #given runtime and migration modules #when source is inspected #then catalog, version, model, and fallback I/O are absent", async () => {
	const sources = await Promise.all([
		readFile(join(root, "scripts", "runtime-adapter.mjs"), "utf8"),
		readFile(join(root, "scripts", "migrate-codex-config.mjs"), "utf8"),
	]);
	const source = sources.join("\n");
	assert.doesNotMatch(source, /catalog|modelId|\bversion\b|fallback/i);
	assert.doesNotMatch(source, /\b(?:gpt|gemini|claude)-[a-z0-9.*-]+\b/i);
});

test("[todo14.distribution] #given workspace distribution metadata #when inspected #then runtime-complete allowlist excludes speculative surfaces", async () => {
	const manifest = JSON.parse(await readFile(join(root, "config", "distribution-files.json"), "utf8"));
	assert.deepEqual(manifest.files, [
		".github/workflows/ci.yml", ".runtime-hint.json", "CHANGELOG.md", "LICENSE.md", "README.md", "hooks.json",
		"mcp_config.json", "package.json", "plugin.json", "shared-skills/index.mjs", "src/README.ko.md", "src/README.md",
	]);
	assert.deepEqual(manifest.directories, [
		"components/git-bash-mcp/dist", "components/lsp-daemon/dist", "components/lsp-tools-mcp/dist", "config", "contracts",
		"docs", "examples", "scripts", "skill-aliases", "skills", "test",
	]);
	assert.deepEqual(manifest.exclude, [".git", ".omo/evidence", "experimental-skills", "node_modules"]);
	assert.equal(JSON.stringify(manifest).includes("model-catalog.json"), false);
});

test("[todo14.todo13-freeze] #given Todo13 ownership hashes #when verified before semantic scan #then every frozen byte remains current", async () => {
	const manifest = JSON.parse(await readFile(join(root, ".omo", "evidence", "task-13-ownership-hashes.json"), "utf8"));
	const stale = [];
	for (const entry of manifest.files) {
		if (!existsSync(join(root, entry.path))) {
			stale.push(`${entry.path}:missing`);
			continue;
		}
		const bytes = await readFile(join(root, entry.path));
		if (sha256(bytes) !== entry.sha256) stale.push(`${entry.path}:hash`);
	}
	assert.deepEqual(stale, []);
});

test("[todo14.semantic-scan] #given frozen active skill subjects #when inspected #then no model-specific routing claims remain", async () => {
	const manifest = JSON.parse(await readFile(join(root, ".omo", "evidence", "task-13-ownership-hashes.json"), "utf8"));
	const activeSubjects = manifest.files
		.map((entry) => entry.path)
		.filter((path) => path.endsWith("/SKILL.md") && (
			path.startsWith("skills/") || path.startsWith("skill-aliases/") || path.startsWith("components/ulw-loop/skills/")
		));
	const offenders = [];
	for (const path of activeSubjects) {
		const claims = findSpeculativeModelClaims(await readFile(join(root, path), "utf8"));
		if (claims.length > 0) offenders.push({ path, claims });
	}
	assert.equal(activeSubjects.length >= 15, true);
	assert.deepEqual(offenders, []);
});

test("[todo14.negative-fixtures] #given prohibited claim fixtures #when scanned #then each is rejected without generic model false positives", () => {
	const prohibited = [
		"modelId: vendor-guessed-id",
		"Use gemini-*-high for verification.",
		"Route Claude Sonnet 4.6 via claude-sonnet-4.6.",
		"canAutoRoute: true",
		"fallback chain: Claude then Gemini",
		"The Gemini model inherits automatically.",
		"Switch GPT-9 to Claude for planning.",
		"Recommended Claude model for this role.",
	];
	for (const fixture of prohibited) assert.notDeepEqual(findSpeculativeModelClaims(fixture), [], fixture);
	assert.deepEqual(findSpeculativeModelClaims("Model data with a fallback value is a generic programming example."), []);
});
