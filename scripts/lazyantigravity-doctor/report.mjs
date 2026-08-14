import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { byName, createContext, finishSection, isDirectory, pathExists, readJson, safeReaddir, stripDotSlash } from "./common.mjs";
import { collectCommandHooks, commandTargetPath } from "./hooks.mjs";
import { mcpServerEntry } from "./mcp.mjs";

const requiredMcpServers = ["ast_grep", "git_bash", "lsp"];
const componentMcpNames = ["ast-grep-mcp", "git-bash-mcp", "lsp-tools-mcp"];

export async function buildDoctorReport(root) {
	const context = createContext(root);
	const packageJson = await readJson(root, "package.json", context, "manifests");
	const pluginJson = await readJson(root, "plugin.json", context, "manifests");
	const components = await readComponents(root);

	const manifests = await inspectManifests(root, context, packageJson, pluginJson);
	const hooks = await inspectHooks(root, context, components);
	const mcp = await inspectMcp(root, context);
	const skills = await inspectSkills(root, context);
	const bundles = await inspectBundles(root, context, components);
	const versions = inspectVersions(context, packageJson, pluginJson, components);
	const warnings = {
		status: context.warnings.length > 0 ? "warn" : "pass",
		items: context.warnings,
	};
	const sections = { manifests, hooks, mcp, skills, bundles, versions, warnings };

	return {
		product: {
			name: "LazyAntigravity",
			package_name: packageJson?.name ?? null,
			plugin_name: pluginJson?.name ?? null,
		},
		root,
		status: Object.values(sections).some((section) => section.status === "fail")
			? "fail"
			: Object.values(sections).some((section) => section.status === "warn")
				? "warn"
				: "pass",
		...sections,
	};
}

export function hasFailures(report) {
	return ["manifests", "hooks", "mcp", "skills", "bundles", "versions", "warnings"].some(
		(section) => report[section]?.status === "fail",
	);
}

async function inspectManifests(root, context, packageJson, pluginJson) {
	const files = await Promise.all(
		[
			{ path: "package.json", required: true },
			{ path: "plugin.json", required: true },
			{ path: ".codex-plugin/plugin.json", required: false },
			{ path: "hooks.json", required: true },
			{ path: "hooks/hooks.json", required: true },
			{ path: ".mcp.json", required: true },
			{ path: "mcp_config.json", required: true },
		].map(async (entry) => {
			const exists = await pathExists(root, entry.path);
			if (!exists && entry.required) {
				context.fail("manifests", "missing_manifest", `${entry.path} is required`);
			} else if (!exists) {
				context.warn("manifests", "missing_generated_manifest", `${entry.path} is not present`);
			}
			return { ...entry, exists };
		}),
	);

	if (packageJson?.name !== "lazyantigravity") {
		context.fail("manifests", "package_name_drift", "package.json name must be lazyantigravity");
	}
	if (pluginJson?.name !== "lazyantigravity") {
		context.fail("manifests", "plugin_name_drift", "plugin.json name must be lazyantigravity");
	}
	if (pluginJson?.interface?.displayName !== "LazyAntigravity") {
		context.fail("manifests", "display_name_drift", "plugin displayName must be LazyAntigravity");
	}

	for (const [field, expectedKind] of [
		["hooks", "file"],
		["mcpServers", "file"],
		["skills", "directory"],
	]) {
		const target = pluginJson?.[field];
		if (typeof target !== "string") {
			context.fail("manifests", "missing_manifest_target", `plugin.json ${field} must be a path`);
			continue;
		}
		const relativeTarget = stripDotSlash(target);
		if (!(await pathExists(root, relativeTarget))) {
			context.fail("manifests", "missing_manifest_target", `${field} target ${target} does not exist`);
		} else if (expectedKind === "directory" && !(await isDirectory(root, relativeTarget))) {
			context.fail("manifests", "wrong_manifest_target_type", `${field} target ${target} must be a directory`);
		}
	}

	return finishSection(context, "manifests", { files });
}

async function inspectHooks(root, context, components) {
	const manifestPaths = ["hooks.json", "hooks/hooks.json", ...components.map((component) => `${component.path}/hooks/hooks.json`)];
	const manifests = [];
	let commandCount = 0;

	for (const manifestPath of manifestPaths) {
		const hooks = await readJson(root, manifestPath, context, "hooks");
		if (hooks === null) continue;
		const commands = collectCommandHooks(hooks, manifestPath, context);
		commandCount += commands.length;
		const missingStatus = commands.filter(({ handler }) => typeof handler.statusMessage !== "string" || handler.statusMessage.trim() === "");
		for (const hook of missingStatus) {
			context.fail("hooks", "missing_status_message", `${hook.location} has no statusMessage`);
		}
		for (const hook of commands) {
			if (/LazyCodex|lazycodex-ai|LAZYCODEX/.test(JSON.stringify(hook.handler))) {
				context.fail("hooks", "legacy_identity", `${hook.location} contains a LazyCodex identity`);
			}
			const targetPath = commandTargetPath(hook.handler.command, manifestPath);
			if (targetPath !== null && !(await pathExists(root, targetPath))) {
				context.fail("hooks", "missing_hook_target", `${hook.location} targets ${targetPath}`);
			}
		}
		manifests.push({ path: manifestPath, command_hooks: commands.length });
	}

	if (commandCount === 0) {
		context.fail("hooks", "no_command_hooks", "no command hooks were discovered");
	}
	return finishSection(context, "hooks", { manifests, command_hooks: commandCount });
}

async function inspectMcp(root, context) {
	const configs = [];
	for (const configPath of [".mcp.json", "mcp_config.json"]) {
		const config = await readJson(root, configPath, context, "mcp");
		if (config === null) continue;
		const servers = config.mcpServers;
		if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
			context.fail("mcp", "invalid_mcp_servers", `${configPath} must contain mcpServers`);
			continue;
		}
		const entries = [];
		for (const requiredName of requiredMcpServers) {
			if (!Object.hasOwn(servers, requiredName)) {
				context.fail("mcp", "missing_mcp_server", `${configPath} is missing ${requiredName}`);
			}
		}
		for (const [name, server] of Object.entries(servers)) {
			entries.push(await mcpServerEntry(root, context, configPath, name, server));
		}
		configs.push({ path: configPath, servers: entries.sort((left, right) => left.name.localeCompare(right.name)) });
	}
	return finishSection(context, "mcp", { configs });
}

async function inspectSkills(root, context) {
	const skillRoot = "skills";
	const entries = await safeReaddir(join(root, skillRoot));
	if (entries === null) {
		context.fail("skills", "missing_skills_root", "skills directory does not exist");
		return finishSection(context, "skills", { root: skillRoot, skills: [] });
	}
	const skills = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name === "references") continue;
		const manifestPath = `${skillRoot}/${entry.name}/SKILL.md`;
		const exists = await pathExists(root, manifestPath);
		if (!exists) {
			context.warn("skills", "missing_skill_manifest", `${manifestPath} is not present`);
		}
		skills.push({ name: entry.name, manifest: manifestPath, exists });
	}
	if (skills.length === 0) {
		context.fail("skills", "no_skills", "no aggregate skills were found");
	}
	return finishSection(context, "skills", { root: skillRoot, count: skills.length, skills: skills.sort(byName) });
}

async function inspectBundles(root, context, components) {
	const componentBundles = [];
	for (const component of components) {
		const cliPath = `${component.path}/dist/cli.js`;
		const distExists = await pathExists(root, `${component.path}/dist`);
		const cliExists = await pathExists(root, cliPath);
		if (!distExists || !cliExists) {
			context.fail("bundles", "missing_component_bundle", `${component.path} is missing dist/cli.js`);
		}
		componentBundles.push({ name: component.name, path: component.path, dist_exists: distExists, cli_exists: cliExists });
	}

	const mcpRuntimes = [];
	for (const name of componentMcpNames) {
		const rootExists = await pathExists(root, name);
		const cliExists = await pathExists(root, `${name}/dist/cli.js`);
		if (!rootExists) {
			context.warn("bundles", "missing_mcp_runtime", `${name} runtime root is not present`);
		} else if (!cliExists) {
			context.warn("bundles", "missing_mcp_runtime_dist", `${name}/dist/cli.js is not present`);
		}
		mcpRuntimes.push({ name, root_exists: rootExists, cli_exists: cliExists });
	}

	return finishSection(context, "bundles", { components: componentBundles.sort(byName), mcp_runtimes: mcpRuntimes });
}

function inspectVersions(context, packageJson, pluginJson, components) {
	const packageVersion = packageJson?.version ?? null;
	const pluginVersion = pluginJson?.version ?? null;
	if (packageVersion !== null && pluginVersion !== null && packageVersion !== pluginVersion) {
		context.fail("versions", "package_plugin_version_drift", `package.json ${packageVersion} differs from plugin.json ${pluginVersion}`);
	}
	return finishSection(context, "versions", {
		package: packageVersion,
		plugin: pluginVersion,
		component_packages: components.map(({ name, version }) => ({ name, version })).sort(byName),
	});
}

async function readComponents(root) {
	const entries = await safeReaddir(join(root, "components"));
	if (entries === null) return [];
	const components = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const packagePath = `components/${entry.name}/package.json`;
		if (!(await pathExists(root, packagePath))) continue;
		const packageJson = JSON.parse(await readFile(join(root, packagePath), "utf8"));
		components.push({
			name: entry.name,
			path: `components/${entry.name}`,
			package_name: packageJson.name ?? null,
			version: packageJson.version ?? null,
		});
	}
	return components.sort((left, right) => left.path.localeCompare(right.path));
}
