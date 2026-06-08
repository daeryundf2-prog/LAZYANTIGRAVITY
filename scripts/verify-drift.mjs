#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, lstatSync, rmSync } from "node:fs";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// Import runtime adapter directly
import { detectRuntime, getRuntimeConfig } from "../plugins/omo/scripts/runtime-adapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const strict = process.argv.includes("--strict");
const jsonMode = process.argv.includes("--json");

const results = [];

function recordResult(name, status, message) {
	results.push({ name, status, message });
}

// ----------------------------------------------------
// 1. Skill source -> build output -> install output
// ----------------------------------------------------
try {
	const skillSrcPath = join(rootDir, "plugins/omo/components/ulw-loop/skills/ulw-loop/SKILL.md");
	const skillBuildPath = join(rootDir, "plugins/omo/skills/ulw-loop/SKILL.md");

	const geminiHome = process.env.GEMINI_HOME || (process.env.HOME || process.env.USERPROFILE ? join(process.env.HOME || process.env.USERPROFILE, ".gemini") : null);
	const targetPluginDir = geminiHome ? join(geminiHome, "config", "plugins", "lazyantigravity") : null;
	const skillInstallPath = targetPluginDir ? join(targetPluginDir, "skills/ulw-loop/SKILL.md") : null;

	if (!existsSync(skillSrcPath)) {
		recordResult("Skill Source Exists", "FAIL", `Source skill file missing at: ${skillSrcPath}`);
	} else if (!existsSync(skillBuildPath)) {
		recordResult("Skill Build Exists", "FAIL", `Build skill file missing at: ${skillBuildPath}`);
	} else {
		recordResult("Skill Source & Build Exist", "PASS", "Source and Build skill files present");

		// Read and verify source vs build (ignoring auto-inserted Antigravity Harness Tool Compatibility)
		const srcContent = readFileSync(skillSrcPath, "utf8");
		const buildContent = readFileSync(skillBuildPath, "utf8");

		// Run insertion function as in sync-skills.mjs by extracting dynamically
		const opencodeOnlyOrchestrationPattern = /\b(?:call_omo_agent|background_output|team_[a-z_]+|task|spawn_agent|wait_agent)\s*\(/;
		
		const syncSkillsCode = readFileSync(join(rootDir, "plugins/omo/scripts/sync-skills.mjs"), "utf8");
		const matchCompatibility = syncSkillsCode.match(/const antigravityHarnessToolCompatibility = `([\s\S]*?)`;/);
		const antigravityHarnessToolCompatibility = matchCompatibility ? matchCompatibility[1].replace(/\\`/g, "`") : "";

		function insertAntigravityCompatibilityGuidance(content) {
			if (!opencodeOnlyOrchestrationPattern.test(content)) return content;
			if (content.includes("## Antigravity Harness Tool Compatibility")) return content;

			const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n+/);
			if (!frontmatterMatch) {
				return `${antigravityHarnessToolCompatibility}${content}`;
			}
			return `${frontmatterMatch[0]}${antigravityHarnessToolCompatibility}${content.slice(frontmatterMatch[0].length)}`;
		}

		// Normalize line endings to LF for comparison
		const expectedBuildContent = insertAntigravityCompatibilityGuidance(srcContent).replace(/\r\n/g, "\n");
		const actualBuildContent = buildContent.replace(/\r\n/g, "\n");

		if (expectedBuildContent !== actualBuildContent) {
			recordResult("Skill Source-Build Alignment", "FAIL", "Build output differs from source after adaptation");
		} else {
			recordResult("Skill Source-Build Alignment", "PASS", "Build output is semantically aligned with source");
		}

		// Install output check
		if (skillInstallPath && existsSync(skillInstallPath)) {
			const installContent = readFileSync(skillInstallPath, "utf8");
			if (buildContent === installContent) {
				recordResult("Skill Build-Install Alignment", "PASS", "Install output is identical to build output");
			} else {
				recordResult("Skill Build-Install Alignment", "FAIL", "Install output differs from build output");
			}
		} else {
			const status = strict ? "FAIL" : "WARNING";
			recordResult("Skill Install Exists", status, `Install output missing at: ${skillInstallPath}`);
		}
	}
} catch (e) {
	recordResult("Skill Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 2. /ulw alias verification
// ----------------------------------------------------
try {
	const aliasSrcPath = join(rootDir, "plugins/omo/skill-aliases/ulw/SKILL.md");
	const geminiHome = process.env.GEMINI_HOME || (process.env.HOME || process.env.USERPROFILE ? join(process.env.HOME || process.env.USERPROFILE, ".gemini") : null);
	const targetPluginDir = geminiHome ? join(geminiHome, "config", "plugins", "lazyantigravity") : null;
	const aliasInstallPath = targetPluginDir ? join(targetPluginDir, "skills/ulw/SKILL.md") : null;

	if (!existsSync(aliasSrcPath)) {
		recordResult("Alias Source Exists", "FAIL", "Alias source SKILL.md missing");
	} else {
		recordResult("Alias Source Exists", "PASS", "Alias source SKILL.md present");

		const aliasContent = readFileSync(aliasSrcPath, "utf8");

		// Verify /ulw alias runs ulw-loop
		if (aliasContent.includes("ulw-loop") && aliasContent.includes("/ulw")) {
			recordResult("Alias Execution Logic", "PASS", "Alias documents execution of ulw-loop");
		} else {
			recordResult("Alias Execution Logic", "FAIL", "Alias missing clear reference to running ulw-loop");
		}

		// Verify userResumeCommand="/ulw resume"
		if (aliasContent.includes("/ulw resume")) {
			recordResult("Alias Resume Reference", "PASS", "Alias mentions /ulw resume");
		} else {
			recordResult("Alias Resume Reference", "FAIL", "Alias does not refer to /ulw resume");
		}

		// Prohibited expressions check (stripping tildes)
		const cleanContent = aliasContent.replace(/~~.*?~~/g, "");
		const prohibited = [
			"switching to Opus",
			"verifier will use Gemini",
			"auto model routing enabled on Antigravity",
			"Antigravity will switch models automatically",
			"model auto-routing on Antigravity"
		];
		let foundProhibited = false;
		for (const term of prohibited) {
			if (cleanContent.includes(term)) {
				foundProhibited = true;
				recordResult("Alias Forbidden Copy", "FAIL", `Found forbidden expression: "${term}"`);
			}
		}
		if (!foundProhibited) {
			recordResult("Alias Forbidden Copy", "PASS", "No active forbidden auto-routing expressions found in alias");
		}

		// Install output check
		if (aliasInstallPath && existsSync(aliasInstallPath)) {
			const installContent = readFileSync(aliasInstallPath, "utf8");
			if (aliasContent === installContent) {
				recordResult("Alias Install Alignment", "PASS", "Alias install output matches source");
			} else {
				recordResult("Alias Install Alignment", "FAIL", "Alias install output differs from source");
			}
		} else {
			const status = strict ? "FAIL" : "WARNING";
			recordResult("Alias Install Exists", status, `Alias install missing at: ${aliasInstallPath}`);
		}
	}
} catch (e) {
	recordResult("Alias Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 3. Duplicate section headings validation
// ----------------------------------------------------
try {
	const headings = [
		"## Antigravity Harness Tool Compatibility",
		"## Antigravity Routing Semantics",
		"## Antigravity Model Recommendation",
		"## Antigravity Quota-Aware Recommendation",
		"## Antigravity \\uAD8C\\uC7A5 \\uBAA8\\uB378 \\uAD6C\\uC131 \\uAC00\\uC774\\uB4DC"
	];

	const omoSkillsDir = join(rootDir, "plugins/omo/skills");
	let dupFound = false;

	if (existsSync(omoSkillsDir)) {
		const files = [];
		function collectMd(dir) {
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = join(dir, entry.name);
				if (entry.isDirectory()) {
					collectMd(fullPath);
				} else if (entry.isFile() && entry.name.endsWith(".md")) {
					files.push(fullPath);
				}
			}
		}
		collectMd(omoSkillsDir);

		for (const file of files) {
			const content = readFileSync(file, "utf8");
			for (const heading of headings) {
				const occurrences = (content.split(heading).length - 1);
				if (occurrences > 1) {
					dupFound = true;
					recordResult("Duplicate Heading Check", "FAIL", `Duplicate heading "${heading}" found in: ${file}`);
				}
			}
		}
	}

	if (!dupFound) {
		recordResult("Duplicate Heading Check", "PASS", "No duplicate Antigravity headings found in skill files");
	}
} catch (e) {
	recordResult("Duplicate Heading Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 4. Model Catalog Validation
// ----------------------------------------------------
try {
	const catalogPath = join(rootDir, "plugins/omo/model-catalog.json");
	if (!existsSync(catalogPath)) {
		recordResult("Model Catalog Exists", "FAIL", "model-catalog.json missing");
	} else {
		const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

		// 1. Codex Validation
		const codex = catalog.codex;
		if (!codex) {
			recordResult("Model Catalog Codex Section", "FAIL", "Missing codex section");
		} else {
			if (codex.canAutoRoute === true) {
				recordResult("Model Catalog Codex AutoRoute", "PASS", "Codex canAutoRoute = true");
			} else {
				recordResult("Model Catalog Codex AutoRoute", "FAIL", "Codex canAutoRoute must be true");
			}

			let missingId = false;
			for (const [role, info] of Object.entries(codex.roles)) {
				if (!info.modelId) {
					missingId = true;
					recordResult("Model Catalog Codex Roles", "FAIL", `Codex role ${role} missing modelId`);
				}
			}
			if (!missingId) {
				recordResult("Model Catalog Codex Roles", "PASS", "All Codex roles have modelId");
			}
		}

		// 2. Antigravity Validation
		const ag = catalog.antigravity;
		if (!ag) {
			recordResult("Model Catalog Antigravity Section", "FAIL", "Missing antigravity section");
		} else {
			if (ag.canAutoRoute === false) {
				recordResult("Model Catalog Antigravity AutoRoute", "PASS", "Antigravity canAutoRoute = false");
			} else {
				recordResult("Model Catalog Antigravity AutoRoute", "FAIL", "Antigravity canAutoRoute must be false");
			}

			if (ag.routingMode === "hint-only") {
				recordResult("Model Catalog Antigravity RoutingMode", "PASS", "Antigravity routingMode = hint-only");
			} else {
				recordResult("Model Catalog Antigravity RoutingMode", "FAIL", "Antigravity routingMode must be hint-only");
			}

			let missingAgId = false;
			let invalidFallback = false;
			const availableIds = ag.availableModels.map(m => m.modelId);

			for (const [role, info] of Object.entries(ag.roles)) {
				if (!info.modelId) {
					missingAgId = true;
					recordResult("Model Catalog Antigravity Roles", "FAIL", `Antigravity role ${role} missing modelId`);
				}
				if (info.fallbackChain) {
					for (const fallbackKey of info.fallbackChain) {
						if (!availableIds.includes(fallbackKey) && !Object.keys(ag.roles).includes(fallbackKey)) {
							invalidFallback = true;
							recordResult("Model Catalog Fallback Reference", "FAIL", `Antigravity role ${role} references unknown fallback key: ${fallbackKey}`);
						}
					}
				}
			}
			if (!missingAgId) {
				recordResult("Model Catalog Antigravity Roles", "PASS", "All Antigravity roles have modelId");
			}
			if (!invalidFallback) {
				recordResult("Model Catalog Fallback Reference", "PASS", "All fallbackChain entries refer to valid keys");
			}

			// Validate available models
			let missingLabel = false;
			let hasRealInternalId = false;
			for (const model of ag.availableModels) {
				if (!model.displayName && !model.selectorLabel) {
					missingLabel = true;
					recordResult("Model Catalog DisplayName", "FAIL", `Model ${model.modelId} missing displayName/selectorLabel`);
				}
				if (model.internalModelId && model.internalModelId !== "unknown") {
					hasRealInternalId = true;
					recordResult("Model Catalog InternalId", "FAIL", `Model ${model.modelId} exposes real internalModelId: ${model.internalModelId}`);
				}
			}
			if (!missingLabel) {
				recordResult("Model Catalog DisplayName", "PASS", "All available models have displayName/selectorLabel");
			}
			if (!hasRealInternalId) {
				recordResult("Model Catalog InternalId", "PASS", "No real internalModelIds exposed (null/unknown/omitted)");
			}
		}
	}
} catch (e) {
	recordResult("Model Catalog Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 5. Runtime Adapter Verification
// ----------------------------------------------------
try {
	const envGemini = { GEMINI_HOME: "/some/gemini" };
	const envAg = { ANTIGRAVITY_HOME: "/some/ag" };
	const envNormal = {};

	const runtimeGemini = detectRuntime(envGemini);
	const runtimeAg = detectRuntime(envAg);
	const runtimeNormal = detectRuntime(envNormal);

	if (runtimeGemini === "antigravity" && runtimeAg === "antigravity") {
		recordResult("Runtime Adapter Detection", "PASS", "detectRuntime successfully identifies Antigravity");
	} else {
		recordResult("Runtime Adapter Detection", "FAIL", "detectRuntime failed to detect Antigravity under correct env");
	}

	const configAg = getRuntimeConfig(envGemini);
	if (configAg.autoUpdateEnabled === false && configAg.configMigrationEnabled === false) {
		recordResult("Runtime Adapter No Auto-Switch", "PASS", "Antigravity config disables auto-update and migration");
	} else {
		recordResult("Runtime Adapter No Auto-Switch", "FAIL", "Antigravity config enables auto-update or migration (unsupported)");
	}
} catch (e) {
	recordResult("Runtime Adapter Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 6. Checkpoint/Resume Schema Verification
// ----------------------------------------------------
try {
	const cliCommandsPath = join(rootDir, "plugins/omo/components/ulw-loop/src/cli-commands.ts");

	if (!existsSync(cliCommandsPath)) {
		recordResult("Checkpoint Code Files", "FAIL", "CLI files for checkpoint verification missing");
	} else {
		const cliContent = readFileSync(cliCommandsPath, "utf8");

		const hasUserResume = cliContent.includes("userResumeCommand");
		const hasInternalResume = cliContent.includes("internalResumeCommand");
		const hasLegacyFallback = cliContent.includes("resumeCommand");

		if (hasUserResume && hasInternalResume) {
			recordResult("Checkpoint Schema Fields", "PASS", "Checkpoint schema supports userResumeCommand and internalResumeCommand");
		} else {
			recordResult("Checkpoint Schema Fields", "FAIL", "Checkpoint schema missing userResumeCommand or internalResumeCommand");
		}

		if (hasLegacyFallback) {
			recordResult("Checkpoint Legacy Compatibility", "PASS", "Legacy resumeCommand fallback code is present");
		} else {
			recordResult("Checkpoint Legacy Compatibility", "FAIL", "Missing backward compatibility logic for resumeCommand");
		}
	}
} catch (e) {
	recordResult("Checkpoint Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 7. Hooks Drift Verification
// ----------------------------------------------------
try {
	const pluginHooksPath = join(rootDir, "plugins/omo/hooks/hooks.json");
	const geminiHome = process.env.GEMINI_HOME || (process.env.HOME || process.env.USERPROFILE ? join(process.env.HOME || process.env.USERPROFILE, ".gemini") : null);
	const targetPluginDir = geminiHome ? join(geminiHome, "config", "plugins", "lazyantigravity") : null;
	const installHooksPath = targetPluginDir ? join(targetPluginDir, "hooks.json") : null;

	if (!existsSync(pluginHooksPath)) {
		recordResult("Hooks File Exists", "FAIL", "plugin hooks.json missing");
	} else {
		const hooksContent = readFileSync(pluginHooksPath, "utf8");
		
		// Validate JSON structure
		const parsed = JSON.parse(hooksContent);
		if (parsed.hooks && typeof parsed.hooks === "object" || parsed.eventHooks) {
			recordResult("Hooks JSON Structure", "PASS", "hooks.json structure is valid");
		} else {
			recordResult("Hooks JSON Structure", "FAIL", "hooks.json is missing expected hooks format");
		}

		// Ensure LazyCodex is not in user-facing status messages
		if (hooksContent.includes('"statusMessage": "LazyCodex')) {
			recordResult("Hooks Branding Check", "FAIL", "Found 'LazyCodex' in hooks statusMessage");
		} else if (hooksContent.includes('"statusMessage": "LazyAntigravity')) {
			recordResult("Hooks Branding Check", "PASS", "hooks statusMessage successfully updated to LazyAntigravity");
		} else {
			recordResult("Hooks Branding Check", "WARNING", "No branding prefix found in statusMessage");
		}

		// Install hooks check
		if (installHooksPath && existsSync(installHooksPath)) {
			const instContent = readFileSync(installHooksPath, "utf8");
			if (hooksContent === instContent) {
				recordResult("Hooks Install Alignment", "PASS", "Install hooks.json matches build output");
			} else {
				recordResult("Hooks Install Alignment", "FAIL", "Install hooks.json differs from build output");
			}
		} else {
			const status = strict ? "FAIL" : "WARNING";
			recordResult("Hooks Install Exists", status, `Install hooks.json missing at: ${installHooksPath}`);
		}

		// Component hooks check
		const componentsDir = join(rootDir, "plugins/omo/components");
		if (existsSync(componentsDir)) {
			const components = readdirSync(componentsDir);
			for (const comp of components) {
				const compHooksPath = join(componentsDir, comp, "hooks/hooks.json");
				if (existsSync(compHooksPath)) {
					const compHooksContent = readFileSync(compHooksPath, "utf8");
					if (compHooksContent.includes('"statusMessage": "LazyCodex')) {
						recordResult(`Component ${comp} Hooks Branding`, "FAIL", `Found 'LazyCodex' in component ${comp} hooks statusMessage`);
					} else {
						recordResult(`Component ${comp} Hooks Branding`, "PASS", `Component ${comp} hooks branding is correct`);
					}
				}
			}
		}
	}
} catch (e) {
	recordResult("Hooks Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 8. Submodule / Source Mirror Drift Verification
// ----------------------------------------------------
try {
	let subStatus = "unknown";
	try {
		subStatus = execSync("git submodule status", { encoding: "utf8", cwd: rootDir }).trim();
		recordResult("Submodule Status Check", "PASS", `Submodule status read: ${subStatus}`);
	} catch {
		recordResult("Submodule Status Check", "WARNING", "Failed to run 'git submodule status' (outside git repo or git missing)");
	}
} catch (e) {
	recordResult("Submodule Check Failure", "WARNING", e.message);
}

// ----------------------------------------------------
// 9. Dry-Run Simulator Policy Verification
// ----------------------------------------------------
try {
	const cliPath = join(rootDir, "plugins/omo/components/ulw-loop/dist/cli.js");
	if (!existsSync(cliPath)) {
		recordResult("Dry-Run CLI Executable Exists", "FAIL", `CLI executable missing at: ${cliPath}`);
	} else {
		// 1. Dry-run subcommand exists in help
		const helpOut = execSync(`node "${cliPath}" ulw-loop help`, { encoding: "utf8", cwd: rootDir });
		if (helpOut.includes("dry-run")) {
			recordResult("Dry-Run Command Presence", "PASS", "dry-run subcommand listed in ulw-loop help");
		} else {
			recordResult("Dry-Run Command Presence", "FAIL", "dry-run subcommand not found in ulw-loop help");
		}

		// 2. Validate --json output and wouldSwitchModel === false
		const tempCheckpointsDir = join(rootDir, ".lazycodex");
		if (existsSync(tempCheckpointsDir)) {
			rmSync(tempCheckpointsDir, { recursive: true, force: true });
		}

		const jsonOutStr = execSync(`node "${cliPath}" ulw-loop dry-run --scenario quota-opus-exhausted --json`, { encoding: "utf8", cwd: rootDir });
		const jsonOut = JSON.parse(jsonOutStr);
		const createdNoFlag = existsSync(tempCheckpointsDir);

		// Now write a checkpoint explicitly
		const jsonOutStr2 = execSync(`node "${cliPath}" ulw-loop dry-run --scenario quota-opus-exhausted --json --write-checkpoint`, { encoding: "utf8", cwd: rootDir });
		const jsonOut2 = JSON.parse(jsonOutStr2);
		const createdWithFlag = existsSync(tempCheckpointsDir) && jsonOut2.checkpointPath !== null && existsSync(jsonOut2.checkpointPath);

		if (jsonOut.dryRun === true && jsonOut.wouldSwitchModel === false && jsonOut.wouldCallModelApi === false && jsonOut.wouldModifySourceFiles === false && !createdNoFlag && createdWithFlag) {
			recordResult("Dry-Run JSON Policy Check", "PASS", "Dry-run executed successfully with wouldSwitchModel=false, wouldCallModelApi=false, wouldModifySourceFiles=false (checkpoints conditionally written)");
		} else {
			recordResult("Dry-Run JSON Policy Check", "FAIL", `Dry-run policy failed: dryRun=${jsonOut.dryRun}, wouldSwitchModel=${jsonOut.wouldSwitchModel}, createdNoFlag=${createdNoFlag}, createdWithFlag=${createdWithFlag}`);
		}

		// 3. Antigravity auto-routing representation check
		const textOut = execSync(`node "${cliPath}" ulw-loop dry-run --scenario quota-opus-exhausted`, { encoding: "utf8", cwd: rootDir });
		const cleanText = textOut.replace(/~~.*?~~/g, "");
		const prohibitedAg = [
			"auto model routing enabled",
			"automatic model switching enabled",
			"wouldSwitchModel: true"
		];
		let foundProhibitedAg = false;
		for (const term of prohibitedAg) {
			if (cleanText.includes(term)) {
				foundProhibitedAg = true;
				recordResult("Dry-Run Prohibited Copy", "FAIL", `Found prohibited auto-routing representation: "${term}"`);
			}
		}
		if (!foundProhibitedAg) {
			recordResult("Dry-Run Prohibited Copy", "PASS", "No active auto-routing claims found in dry-run output");
		}

		// Clean up created checkpoints in workspace
		if (existsSync(tempCheckpointsDir)) {
			rmSync(tempCheckpointsDir, { recursive: true, force: true });
		}
	}
} catch (e) {
	recordResult("Dry-Run Policy Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 10. Subagent Control Plane Verification
// ----------------------------------------------------
try {
	const ULW_LOOP_DIR = join(rootDir, 'plugins/omo/components/ulw-loop');
	const controlPlaneSchemaPath = join(ULW_LOOP_DIR, 'src', 'control-plane-types.ts');
	const dryRunPath = join(ULW_LOOP_DIR, 'src', 'dry-run.ts');
	const verificationPipelinePath = join(ULW_LOOP_DIR, 'src', 'verification-pipeline.ts');
	const verificationPolicyPath = join(ULW_LOOP_DIR, 'config', 'verification-policy.json');

	if (existsSync(controlPlaneSchemaPath) && existsSync(dryRunPath)) {
		console.log('[PASS] Control Plane Schema Files: Control plane schema and types files exist');

		if (existsSync(verificationPipelinePath) && existsSync(verificationPolicyPath)) {
			recordResult("Verification Pipeline Files", "PASS", "Verification schema and policy files exist");
		} else {
			recordResult("Verification Pipeline Files", "FAIL", "Missing verification-pipeline.ts or verification-policy.json");
		}

		const schemaContent = readFileSync(controlPlaneSchemaPath, 'utf8');
		if (schemaContent.includes('quality_gate.started') && schemaContent.includes('quality_gate.failed')) {
			recordResult("Quality Gate Events", "PASS", "Quality gate events exist in EventType");
		} else {
			recordResult("Quality Gate Events", "FAIL", "Missing quality gate events in EventType");
		}

		const cliPath = join(rootDir, "plugins/omo/components/ulw-loop/dist/cli.js");
		// Validate validation logic and forbidden copy checking
		const { validateResultEnvelope } = await import("../plugins/omo/components/ulw-loop/dist/control-plane.js");
		try {
			validateResultEnvelope({
				runId: "run-1",
				agentId: "agent-1",
				role: "worker",
				status: "success",
				summary: "I completed the whole task successfully",
				filesChanged: ["src/index.ts"],
				commandsRun: [],
				artifactsGenerated: [],
				blockers: [],
				nextRecommendedAction: "None",
				requiresParentAck: true
			}, "run-1", "worker");
			recordResult("Control Plane Forbidden Copy Check", "FAIL", "Failed to reject forbidden self-finalization phrase");
		} catch (err) {
			recordResult("Control Plane Forbidden Copy Check", "PASS", `Successfully rejected forbidden phrase: ${err.message}`);
		}

		// Verify that all 10 dry-run scenarios run via CLI (5 control plane + 5 verification)
		const scenarios = [
			"subagent-self-finalizes",
			"stale-heartbeat-missed",
			"polling-loop-prevented",
			"parent-progress-reconstruct",
			"subagent-wrong-role-envelope",
			"quality-happy-path",
			"quality-mechanical-fail",
			"quality-semantic-insufficient-evidence",
			"quality-consensus-required",
			"quality-stagnation-unresolved"
		];

		let allScenariosPass = true;
		for (const scenario of scenarios) {
			try {
				const outStr = execSync(`node "${cliPath}" ulw-loop dry-run --scenario ${scenario} --json`, { encoding: "utf8", cwd: rootDir });
				const out = JSON.parse(outStr);
				if (out.ok !== true) {
					allScenariosPass = false;
					recordResult(`Dry-Run Scenario ${scenario}`, "FAIL", `Scenario did not report ok=true`);
				}
			} catch (err) {
				allScenariosPass = false;
				recordResult(`Dry-Run Scenario ${scenario}`, "FAIL", err.message);
			}
		}

		if (allScenariosPass) {
			recordResult("Dry-Run Scenarios Check", "PASS", "All control-plane and verification scenarios ran successfully");
		}

	} else {
		recordResult("Control Plane Schema Files", "FAIL", "Control plane schema and types files are missing");
	}
} catch (e) {
	recordResult("Control Plane Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// 11. P1-A Verification Policy Constraints
// ----------------------------------------------------
try {
	const ULW_LOOP_DIR = join(rootDir, 'plugins/omo/components/ulw-loop');
	const pipelineContent = readFileSync(join(ULW_LOOP_DIR, 'src', 'verification-pipeline.ts'), 'utf8');

	if (pipelineContent.includes('"run.failed"') || pipelineContent.includes('"run.completed"')) {
		recordResult("Verification Run State Policy", "FAIL", "run.failed or run.completed is directly referenced in verification pipeline");
	} else {
		recordResult("Verification Run State Policy", "PASS", "run.failed and run.completed are not directly written by verification pipeline");
	}

	const cliPath = join(rootDir, "plugins/omo/components/ulw-loop/dist/cli.js");
	const outStr = execSync(`node "${cliPath}" ulw-loop dry-run --scenario quality-consensus-required --json`, { encoding: "utf8", cwd: rootDir });
	const out = JSON.parse(outStr);
	
	if (out.wouldCallModelApi === false && out.wouldSwitchModel === false && out.finalizerAllowed === false) {
		recordResult("Consensus Gate Sandbox Policy", "PASS", "Consensus gate properly blocks model API, auto-switch, and finalizer");
	} else {
		recordResult("Consensus Gate Sandbox Policy", "FAIL", "Consensus gate violates sandbox policies");
	}
} catch (e) {
	recordResult("P1-A Policy Constraints Check Failure", "FAIL", e.message);
}

// ----------------------------------------------------
// Report and Exit
// ----------------------------------------------------
let overallPass = true;

if (jsonMode) {
	console.log(JSON.stringify(results, null, 2));
} else {
	console.log("=== LazyAntigravity Drift Verification ===");
	for (const res of results) {
		console.log(`[${res.status}] ${res.name}: ${res.message}`);
		if (res.status === "FAIL") {
			overallPass = false;
		}
	}
	console.log("==========================================");
	if (overallPass) {
		console.log("Drift Verification Result: PASS");
	} else {
		console.log("Drift Verification Result: FAIL");
	}
}

if (!overallPass) {
	process.exit(1);
} else {
	process.exit(0);
}
