import { dirname, join, normalize } from "node:path";

export function collectCommandHooks(hooks, source, context) {
	const groupsByEvent = hooks.hooks;
	if (typeof groupsByEvent !== "object" || groupsByEvent === null || Array.isArray(groupsByEvent)) {
		context.fail("hooks", "invalid_hooks_manifest", `${source} must contain a hooks object`);
		return [];
	}
	const commands = [];
	for (const [eventName, groups] of Object.entries(groupsByEvent)) {
		if (!Array.isArray(groups)) {
			context.fail("hooks", "invalid_hook_groups", `${source}:${eventName} must be an array`);
			continue;
		}
		groups.forEach((group, groupIndex) => {
			if (typeof group !== "object" || group === null || !Array.isArray(group.hooks)) {
				context.fail("hooks", "invalid_hook_group", `${source}:${eventName}:${groupIndex} must have hooks`);
				return;
			}
			group.hooks.forEach((handler, handlerIndex) => {
				if (typeof handler !== "object" || handler === null || handler.type !== "command") return;
				commands.push({
					location: `${source}:${eventName}:${groupIndex}:${handlerIndex}`,
					handler,
				});
			});
		});
	}
	return commands;
}

export function commandTargetPath(command, source) {
	if (typeof command !== "string") return null;
	const match = command.match(/\$\{PLUGIN_ROOT\}\/([^"'\s]+)/);
	if (match === null) return null;
	const target = match[1];
	if (!source.startsWith("components/") || target.startsWith("components/")) return target;
	return normalize(join(dirname(dirname(source)), target));
}
