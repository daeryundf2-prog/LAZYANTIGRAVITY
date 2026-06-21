import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const codexCompatibilityEndMarkers = [
	"For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long passes and `BLOCKED: <reason>` only when progress stops. A `wait_agent` timeout only means no new mailbox update arrived. Treat a running child or latest `WORKING:` message as alive. Do not use `list_agents` as a polling loop. Fallback only when the child is completed without the deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running.\n\n",
	"For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long passes and `BLOCKED: <reason>` only when progress stops. A `multi_agent_v1.wait_agent` timeout only means no new mailbox update arrived. Treat a running child as alive. Fallback only when the child is completed without the deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running.\n\n",
	"Codex full-history forks inherit the parent agent type, model, and reasoning effort, so role-specific spawns with `agent_type` must use a non-full-history fork mode such as `fork_turns=\"none\"`. Include any required conversation context, files, diffs, constraints, and requested skill names directly in the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
	"When translating `load_skills=[...]`, include the requested skill names in the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
	"When translating `load_skills=[...]`, name the skills inside the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
];

export function removeCodexCompatibilityGuidance(content) {
	let clean = content.replace(/\r\n/g, "\n");
	const agStart = clean.indexOf("## Antigravity Harness Tool Compatibility\n\n");
	if (agStart !== -1) {
		const agEndMarker = "For work likely to exceed one cycle, instruct the subagent to report progress regularly. When you launch a subagent or start a task in the background, you do not need to poll or check status in a loop. You will be automatically notified when there is an update. Simply go idle or proceed with other work.\n\n";
		const agEnd = clean.indexOf(agEndMarker, agStart);
		if (agEnd !== -1) {
			clean = `${clean.slice(0, agStart)}${clean.slice(agEnd + agEndMarker.length)}`;
		}
	}

	const start = clean.indexOf("## Codex Harness Tool Compatibility\n\n");
	if (start === -1) return clean;
	const endMarker = codexCompatibilityEndMarkers.find((marker) => clean.indexOf(marker, start) !== -1);
	assert.notEqual(endMarker, undefined, "Codex compatibility guidance block is missing its terminator");
	const end = clean.indexOf(endMarker, start);
	assert.notEqual(end, -1, "Codex compatibility guidance block is missing its terminator");
	return `${clean.slice(0, start)}${clean.slice(end + endMarker.length)}`;
}

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
export const repoRoot = pkg.name === "lazyantigravity" ? root : join(root, "..", "..", "..");

export async function readJson(relativePath) {
	if (relativePath === ".codex-plugin/plugin.json") {
		if (!(await exists(".codex-plugin/plugin.json"))) {
			relativePath = "plugin.json";
		}
	}
	return JSON.parse(await readFile(join(root, relativePath), "utf8"));
}

export async function readRepoJson(relativePath) {
	return JSON.parse(await readFile(join(repoRoot, relativePath), "utf8"));
}

export async function readPluginVersion() {
	return (await readJson(".codex-plugin/plugin.json")).version;
}

export async function exists(relativePath) {
	try {
		await stat(join(root, relativePath));
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

export async function readComponentHookManifests() {
	const components = await readdir(join(root, "components"), { withFileTypes: true });
	const manifests = [];
	for (const entry of components) {
		if (!entry.isDirectory()) continue;
		const source = join("components", entry.name, "hooks", "hooks.json");
		if (!(await exists(source))) continue;
		manifests.push({ source, hooks: await readJson(source) });
	}
	return manifests.sort((left, right) => left.source.localeCompare(right.source));
}

export function collectCommandHooks(hooks, source) {
	const config = hooks.hooks;
	if (typeof config !== "object" || config === null || Array.isArray(config)) {
		throw new TypeError(`Invalid hooks manifest: ${source}`);
	}
	const commandHooks = [];
	for (const [eventName, groups] of Object.entries(config)) {
		if (!Array.isArray(groups)) {
			throw new TypeError(`Invalid hook groups in ${source}:${eventName}`);
		}
		groups.forEach((group, groupIndex) => {
			if (typeof group !== "object" || group === null || !Array.isArray(group.hooks)) {
				throw new TypeError(`Invalid hook group in ${source}:${eventName}:${groupIndex}`);
			}
			group.hooks.forEach((handler, handlerIndex) => {
				if (typeof handler !== "object" || handler === null || handler.type !== "command") return;
				commandHooks.push({ source, eventName, groupIndex, handlerIndex, handler });
			});
		});
	}
	return commandHooks;
}

export function hookLocation({ source, eventName, groupIndex, handlerIndex, handler }) {
	return `${source}:${eventName}:${groupIndex}:${handlerIndex}:${handler.command}`;
}

export function findSpawnAgentTypes(content) {
	const agentTypes = new Set();
	const oldRegex = /spawn_agent\(agent_type="([^"]+)"/g;
	for (const match of content.matchAll(oldRegex)) {
		agentTypes.add(match[1]);
	}
	const newRegex = /"agent_type"\s*:\s*"([^"]+)"|agent_type\s*:\s*"([^"]+)"/g;
	for (const match of content.matchAll(newRegex)) {
		agentTypes.add(match[1] || match[2]);
	}
	return [...agentTypes].sort();
}

export function findRoleSpecificSpawnsWithoutForkTurnsNone(content) {
	const missingForkTurns = [];
	const regex = /(?:multi_agent_v1\.)?spawn_agent\([\s\S]*?\)/g;
	for (const match of content.matchAll(regex)) {
		const call = match[0];
		const hasAgentType = /agent_type/i.test(call);
		if (hasAgentType) {
			const hasForkTurnsNone = call.includes('fork_turns="none"') || 
			                         call.includes('fork_context: false') || 
			                         call.includes('"fork_context":false') ||
			                         call.includes('fork_context:false') ||
			                         call.includes('"fork_context": false');
			if (!hasForkTurnsNone) {
				missingForkTurns.push(call);
			}
		}
	}
	return missingForkTurns;
}
