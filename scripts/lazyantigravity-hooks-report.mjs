#!/usr/bin/env node
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const REPORT_FORMAT = "lazyantigravity-hooks-report.v1";
const PRODUCT_NAME = "LazyAntigravity";
const LEGACY_PRODUCT_NAME = "LazyCodex";
const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function exists(path) {
	try {
		await access(path);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

export async function buildHooksReport(root = defaultRoot) {
	const manifests = await readHookManifests(root);
	const hooks = manifests.flatMap((manifest) => collectCommandHooks(manifest));
	return {
		format: REPORT_FORMAT,
		source_count: manifests.length,
		hook_count: hooks.length,
		hooks,
	};
}

async function readHookManifests(root) {
	const { activeHooksPath, sources } = await findHookManifestSources(root);
	const manifests = [];
	for (const source of sources) {
		manifests.push({
			path: join(root, source),
			source,
			kind: classifySource(source, activeHooksPath),
			hooks: await readJson(join(root, source)),
		});
	}
	return manifests;
}

async function findHookManifestSources(root) {
	const sources = [];

	// 1. Read plugin.json to find the active hooks file
	const pluginJsonPath = join(root, "plugin.json");
	let activeHooksPath = "hooks/hooks.json"; // default fallback
	try {
		const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf8"));
		if (typeof pluginJson.hooks === "string") {
			activeHooksPath = pluginJson.hooks.replace(/^\.\//, "");
		} else {
			throw new Error("plugin.json is missing 'hooks' field");
		}
	} catch (error) {
		process.stderr.write(`[hooks-report] Warning: Failed to parse plugin.json: ${error.message}. Using fallback.\n`);
	}

	// Add the active hooks path if it exists
	if (await exists(join(root, activeHooksPath))) {
		sources.push(activeHooksPath);
	}

	// 2. Scan component directories for hooks
	const componentsDir = join(root, "components");
	if (await exists(componentsDir)) {
		const components = await readdir(componentsDir, { withFileTypes: true });
		for (const comp of components) {
			if (!comp.isDirectory()) continue;
			const compHooksPath = join("components", comp.name, "hooks", "hooks.json");
			if (await exists(join(root, compHooksPath))) {
				sources.push(compHooksPath);
			}
		}
	}

	return {
		activeHooksPath,
		sources: sources.sort((left, right) => left.localeCompare(right)),
	};
}

function classifySource(source, activeHooksPath) {
	if (source === activeHooksPath || source === "hooks/hooks.json" || source.endsWith("plugin/hooks/hooks.json")) {
		return "aggregate";
	}
	if (source.includes("components/")) {
		return "component";
	}
	return "other";
}

function collectCommandHooks({ source, kind, hooks }) {
	const config = hooks.hooks;
	if (typeof config !== "object" || config === null || Array.isArray(config)) {
		throw new TypeError(`Invalid hooks manifest: ${source}`);
	}

	const commandHooks = [];
	for (const [event, groups] of Object.entries(config)) {
		if (!Array.isArray(groups)) {
			throw new TypeError(`Invalid hook groups in ${source}:${event}`);
		}
		groups.forEach((group, group_index) => {
			if (typeof group !== "object" || group === null || !Array.isArray(group.hooks)) {
				throw new TypeError(`Invalid hook group in ${source}:${event}:${group_index}`);
			}
			group.hooks.forEach((handler, handler_index) => {
				if (typeof handler !== "object" || handler === null || handler.type !== "command") return;
				commandHooks.push(formatHook({ source, kind, event, group, group_index, handler, handler_index }));
			});
		});
	}
	return commandHooks;
}

function formatHook({ source, kind, event, group, group_index, handler, handler_index }) {
	const statusMessage = typeof handler.statusMessage === "string" ? handler.statusMessage : "";
	return {
		id: `${source}:${event}:${group_index}:${handler_index}`,
		source,
		source_type: kind,
		event,
		matcher: typeof group.matcher === "string" ? group.matcher : "",
		command: typeof handler.command === "string" ? handler.command : "",
		timeout: typeof handler.timeout === "number" ? handler.timeout : null,
		failure_policy: classifyFailurePolicy(handler.failurePolicy),
		fallback_payload: Object.hasOwn(handler, "fallbackPayload") ? "present" : "absent",
		status_message: statusMessage,
		product_label_drift: classifyProductLabelDrift(statusMessage),
	};
}

function classifyFailurePolicy(policy) {
	if (typeof policy !== "string" || policy.trim() === "") return "none";
	const normalized = policy.trim().toUpperCase();
	if (normalized === "FAIL_OPEN") return "fail_open";
	if (normalized === "FAIL_SAFE") return "fail_safe";
	return "unknown";
}

function classifyProductLabelDrift(statusMessage) {
	if (typeof statusMessage !== "string" || statusMessage.trim() === "") return "missing";
	const match = /^([A-Za-z][A-Za-z0-9-]*)\([^)]+\):\s+.+$/.exec(statusMessage.trim());
	if (match === null) return "unexpected";
	const [, productName] = match;
	if (productName === PRODUCT_NAME) return "none";
	if (productName === LEGACY_PRODUCT_NAME) return "legacy";
	return "unexpected";
}

function parseCliArgs(args) {
	if (args.length === 1 && args[0] === "--json") return { json: true };
	throw new Error("Usage: npm run hooks:report -- --json");
}

async function main() {
	try {
		parseCliArgs(process.argv.slice(2));
		const report = await buildHooksReport();
		process.stdout.write(`${JSON.stringify(report, null, "\t")}\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exitCode = 1;
	}
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
