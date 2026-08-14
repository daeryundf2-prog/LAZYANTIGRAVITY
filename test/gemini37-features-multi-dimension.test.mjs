import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("Dimension 1: Model Catalog & Subagent Routing Consistency", async () => {
	const catalogPath = join(root, "model-catalog.json");
	const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

	assert.ok(catalog.antigravity, "antigravity section must exist");
	assert.equal(catalog.antigravity.canTierRoute, true, "canTierRoute must be true");

	// Verify tierMap
	const validTiers = new Set(["flash", "pro", "flash_lite", "inherit"]);
	for (const [role, tier] of Object.entries(catalog.antigravity.tierMap)) {
		assert.ok(validTiers.has(tier), `Invalid tier '${tier}' for role '${role}' in tierMap`);
	}

	// Verify required roles exist in tierMap
	const requiredRoles = ["default", "planner", "worker", "researcher", "surveyor", "verifier", "fast", "fallback"];
	for (const role of requiredRoles) {
		assert.ok(catalog.antigravity.tierMap[role], `Missing role '${role}' in antigravity tierMap`);
	}

	// Verify fallbackChain resolution
	const availableModelIds = new Set(catalog.antigravity.availableModels.map((m) => m.modelId));
	for (const [roleName, roleDef] of Object.entries(catalog.antigravity.roles)) {
		assert.ok(roleDef.modelId, `Role '${roleName}' missing modelId`);
		for (const fallback of roleDef.fallbackChain) {
			assert.ok(
				availableModelIds.has(fallback) || catalog.antigravity.roles[fallback],
				`Role '${roleName}' fallback '${fallback}' does not resolve to an available model or role`,
			);
		}
	}
});

test("Dimension 2: All Skills YAML Frontmatter & Naming Integrity", async () => {
	const skillsRoot = join(root, "skills");
	const entries = await readdir(skillsRoot, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name === "references") continue;
		const skillFilePath = join(skillsRoot, entry.name, "SKILL.md");
		const content = await readFile(skillFilePath, "utf8");

		// Must start with YAML frontmatter
		assert.match(content, /^---\r?\n/, `${entry.name}/SKILL.md must start with frontmatter dashes`);
		const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		assert.ok(frontmatterMatch, `${entry.name}/SKILL.md missing valid frontmatter block`);

		const frontmatter = frontmatterMatch[1];
		assert.match(frontmatter, /name:\s*[\w-]+/, `${entry.name}/SKILL.md frontmatter must contain name`);
		assert.match(frontmatter, /description:\s*.+/, `${entry.name}/SKILL.md frontmatter must contain description`);
	}
});

test("Dimension 3: Subagent Invocation Schema & Tier Routing Contracts", async () => {
	const skillsRoot = join(root, "skills");
	const sharedSkillsRoot = join(root, "shared-skills", "skills");

	async function checkSubagentCalls(dir) {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				await checkSubagentCalls(fullPath);
			} else if (entry.name.endsWith(".md")) {
				const content = await readFile(fullPath, "utf8");
				// Check that invoke_subagent calls do not use invalid parameters
				assert.doesNotMatch(
					content,
					/invoke_subagent\([^)]*model_tier\s*=/s,
					`invoke_subagent with legacy model_tier parameter found in ${fullPath}`,
				);
				assert.doesNotMatch(
					content,
					/invoke_subagent\([^)]*agent_type\s*=/s,
					`invoke_subagent with legacy agent_type parameter found in ${fullPath}`,
				);
				assert.doesNotMatch(
					content,
					/invoke_subagent\([^)]*run_in_background\s*=/s,
					`invoke_subagent with legacy run_in_background parameter found in ${fullPath}`,
				);
				assert.doesNotMatch(
					content,
					/invoke_subagent\(\s*prompt\s*=/s,
					`invoke_subagent with legacy prompt= parameter found in ${fullPath}. Must use Subagents array schema.`,
				);
				assert.doesNotMatch(
					content,
					/background_output\(/s,
					`Legacy background_output found in ${fullPath}. Antigravity uses reactive message wakeup.`,
				);

				// If invoke_subagent with Model is used, verify Model is valid enum
				const modelMatches = content.matchAll(/Model:\s*"([^"]+)"/g);
				for (const match of modelMatches) {
					const modelTier = match[1];
					const validTiers = ["pro", "flash", "flash_lite", "inherit"];
					assert.ok(
						validTiers.includes(modelTier),
						`Invalid Model tier '${modelTier}' in ${fullPath}. Must be one of: ${validTiers.join(", ")}`,
					);
				}
			}
		}
	}

	await checkSubagentCalls(skillsRoot);
	await checkSubagentCalls(sharedSkillsRoot);
});

test("Dimension 4: 1M Context repo-survey Skill Functional & Structural Integrity", async () => {
	const sharedSkill = join(root, "shared-skills", "skills", "repo-survey", "SKILL.md");
	const packagedSkill = join(root, "skills", "repo-survey", "SKILL.md");

	assert.equal(
		await readFile(sharedSkill, "utf8"),
		await readFile(packagedSkill, "utf8"),
		"repo-survey skill must be strictly identical between shared-skills and packaged skills",
	);

	const content = await readFile(packagedSkill, "utf8");
	assert.match(content, /name:\s*repo-survey/, "Skill name must be repo-survey");
	assert.match(content, /1M-context whole-codebase architecture survey/i, "Description must cite 1M context");
	assert.match(content, /Architecture Mapping/i, "Must describe architecture mapping");
	assert.match(content, /Blast Radius/i, "Must describe blast radius simulation");
	assert.match(content, /Error Hygiene/i, "Must describe error hygiene audit");
	assert.match(content, /Model:\s*"flash"/, "Must include Model: flash scout subagent template");
	assert.match(content, /Model:\s*"pro"/, "Must include Model: pro architectural critique mapping");
});

test("Dimension 5: Multi-Tier review-work Skill & Tiered Blocking Policy", async () => {
	const skillPath = join(root, "skills", "review-work", "SKILL.md");
	const content = await readFile(skillPath, "utf8");

	assert.match(content, /Security Oracle \(Pro\)/, "Must include Security Oracle");
	assert.match(content, /Code Quality & Logic Oracle \(Pro\)/, "Must include Code Quality & Logic Oracle");
	assert.match(content, /Visual & CJK Fidelity Oracle \(Flash\)/, "Must include Visual & CJK Fidelity Oracle");
	assert.match(content, /Performance & Efficiency Oracle \(Flash\)/, "Must include Performance & Efficiency Oracle");
	assert.match(content, /Tiered Blocking Policy/i, "Must define Tiered Blocking Policy");
	assert.match(content, /Core Blocking Gates \(Must PASS\)/i, "Must declare Blocking Gates");
	assert.match(content, /Advisory Gates \(Warnings allowed\)/i, "Must declare Advisory Gates");
});

test("Dimension 6: Multimodal visual-qa & frontend-ui-ux Integration", async () => {
	const vqaContent = await readFile(join(root, "skills", "visual-qa", "SKILL.md"), "utf8");
	const feContent = await readFile(join(root, "skills", "frontend-ui-ux", "SKILL.md"), "utf8");

	assert.match(vqaContent, /Pass C - Gemini 3.7 Flash vision pre-screen/i, "visual-qa must feature Pass C");
	assert.match(vqaContent, /Model:\s*"flash"/, "Pass C must route to Model: flash");
	assert.match(vqaContent, /CJK glyph state|CJK/i, "visual-qa must check CJK precision");
	assert.match(feContent, /Multimodal Vision QA/i, "frontend-ui-ux must include Multimodal Vision QA protocol");
	assert.match(feContent, /Pass C/i, "frontend-ui-ux must reference Pass C");
});

test("Dimension 7: Packaging & npm Pack Materialization Dry-Run", async () => {
	const { execSync } = await import("node:child_process");
	const output = execSync("npm pack --dry-run --json", { cwd: root, encoding: "utf8" });
	const parsed = JSON.parse(output);
	const files = parsed[0].files.map((f) => f.path);

	assert.ok(files.includes("shared-skills/skills/repo-survey/SKILL.md"), "npm pack must include repo-survey");
	assert.ok(files.includes("shared-skills/skills/review-work/SKILL.md"), "npm pack must include review-work");
	assert.ok(files.includes("shared-skills/skills/visual-qa/SKILL.md"), "npm pack must include visual-qa");
	assert.ok(files.includes("shared-skills/skills/frontend-ui-ux/SKILL.md"), "npm pack must include frontend-ui-ux");
});
