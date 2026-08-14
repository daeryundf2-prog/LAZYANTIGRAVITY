import assert from "node:assert/strict";
import test from "node:test";

import {
	collectCommandHooks,
	exists,
	hookLocation,
	readComponentHookManifests,
	readJson,
} from "./aggregate-plugin-fixture.mjs";

test("#given runtime hook manifests #when identity labels are inspected #then LazyAntigravity is the product identity", async () => {
	// given
	const aggregateHooks = await readJson("hooks/hooks.json");
	const componentHooks = await readComponentHookManifests();

	// when
	const commandHooks = [
		...collectCommandHooks(aggregateHooks, "hooks/hooks.json"),
		...componentHooks.flatMap(({ source, hooks }) => collectCommandHooks(hooks, source)),
	];
	const legacyIdentityLocations = commandHooks
		.filter(({ handler }) => /LazyCodex|lazycodex-ai|LAZYCODEX/.test(JSON.stringify(handler)))
		.map(hookLocation);

	// then
	assert.deepEqual(legacyIdentityLocations, []);
});

test("#given isolated components #when hooks are inspected #then commands stay inside component roots", async () => {
	// given
	const hooks = await readJson("hooks/hooks.json");
	const text = JSON.stringify(hooks);

	// when
	const componentMarkers = [
		"components/comment-checker/dist/cli.js",
		"components/lsp/dist/cli.js",
		"components/rules/dist/cli.js",
		"components/start-work-continuation/dist/cli.js",
		"components/telemetry/dist/cli.js",
		"components/ulw-loop/dist/cli.js",
		"components/ultrawork/dist/cli.js",
	];

	// then
	for (const marker of componentMarkers) {
		assert.match(text, new RegExp(marker.replaceAll("/", "\\/")));
	}
	// auto-update.mjs is invoked as a CLI (`npm run` + `scripts/auto-update.mjs --status`),
	// not as a SessionStart hook in the antigravity-only manifest.
	assert.doesNotMatch(text, /scripts\/auto-update\.mjs/);
	assert.doesNotMatch(text, /codex-(comment-checker|lsp|rules|telemetry|ulw-loop|ultrawork)@/);
	assert.equal(await exists("scripts/migrate-codex-config.mjs"), true);
});

test("#given aggregate PostCompact hooks #when hooks are inspected #then LSP diagnostics cache reset is registered", async () => {
	// given
	const hooks = await readJson("hooks/hooks.json");
	const aggregateVersion = (await readJson("plugin.json")).version;

	// when
	const lspPostCompactHooks = collectCommandHooks(hooks, "hooks/hooks.json").filter(
		(hook) =>
			hook.eventName === "PostCompact" &&
			hook.handler.command === 'node "${PLUGIN_ROOT}/components/lsp/dist/cli.js" hook post-compact',
	);

	// then
	assert.equal(lspPostCompactHooks.length, 1);
	assert.equal(lspPostCompactHooks[0]?.handler.statusMessage, `LazyAntigravity(${aggregateVersion}): Resetting LSP Diagnostics Cache`);
});

test("#given aggregate hook commands #when inspected #then every command exposes a Codex status message", async () => {
	// given
	const hooks = await readJson("hooks/hooks.json");

	// when
	const commandHooks = collectCommandHooks(hooks, "hooks/hooks.json");
	const missingStatusMessages = commandHooks
		.filter(({ handler }) => typeof handler.statusMessage !== "string" || handler.statusMessage.trim() === "")
		.map(hookLocation);

	// then
	assert.deepEqual(missingStatusMessages, []);
});

test("#given component hook commands #when inspected #then standalone packages expose Codex status messages", async () => {
	// given
	const componentHooks = await readComponentHookManifests();

	// when
	const missingStatusMessages = componentHooks
		.flatMap(({ source, hooks }) => collectCommandHooks(hooks, source))
		.filter(({ handler }) => typeof handler.statusMessage !== "string" || handler.statusMessage.trim() === "")
		.map(hookLocation);

	// then
	assert.deepEqual(missingStatusMessages, []);
});

test("#given hook status messages #when inspected #then labels describe OMO responsibilities instead of the hook runner", async () => {
	// given
	const aggregateHooks = await readJson("hooks/hooks.json");
	const componentHooks = await readComponentHookManifests();

	// when
	const commandHooks = [
		...collectCommandHooks(aggregateHooks, "hooks/hooks.json"),
		...componentHooks.flatMap(({ source, hooks }) => collectCommandHooks(hooks, source)),
	];
	const genericStatusMessages = commandHooks
		.filter(({ handler }) => typeof handler.statusMessage !== "string" || /\bhook\b/i.test(handler.statusMessage))
		.map(hookLocation);

	// then
	assert.deepEqual(genericStatusMessages, []);
});

test("#given aggregate OMO plugin is enabled #when hooks are inspected #then shell guidance and ulw-loop guard are registered", async () => {
	// given
	const hooks = await readJson("hooks/hooks.json");
	const text = JSON.stringify(hooks);

	// when
	const preToolUseGroups = hooks.hooks.PreToolUse;

	// then
	assert.match(text, /components\/git-bash\/dist\/cli\.js/);
	assert.match(text, /Recommending Git Bash Mcp/);
	assert.match(text, /hook post-compact/);
	assert.match(text, /Resetting Git Bash Mcp Reminder/);
	assert.match(text, /components\/ulw-loop\/dist\/cli\.js/);
	assert.match(text, /Checking Ulw-Loop Steering/);
	assert.deepEqual(preToolUseGroups.map((group) => group.matcher), [
		"^(Bash|bash|shell|Shell|run_command|RunCommand|terminal|Terminal|execute|Execute)$",
	]);
	assert.doesNotMatch(text, /create_goal/);
});

test("#given aggregate SessionStart hooks #when inspected #then LazyAntigravity auto-update hook is NOT registered (antigravity-only)", async () => {
		// given
		const hooks = await readJson("hooks/hooks.json");
		const text = JSON.stringify(hooks);

		// when
		const sessionStartCommands = collectCommandHooks(hooks, "hooks/hooks.json")
			.filter(({ eventName }) => eventName === "SessionStart")
			.map(({ handler }) => handler.command);
		const autoUpdateGroup = hooks.hooks.SessionStart.find((group) => JSON.stringify(group).includes("scripts/auto-update.mjs"));

		// then
		assert.equal(autoUpdateGroup, undefined, "auto-update SessionStart hook must not be registered for antigravity-only runtime (it is a no-op under autoUpdateEnabled=false and wastes 5s on every session start)");
		assert.doesNotMatch(text, /Checking Auto Update/);
		assert.equal(
			sessionStartCommands.some((command) => command.includes("scripts/auto-update.mjs")),
			false,
			"auto-update.mjs must not be wired as a SessionStart hook in the antigravity-only manifest"
		);
		// auto-update.mjs file itself remains for CLI status/dry-run use (`npm run` + test surfaces)
		assert.equal(await exists("scripts/auto-update.mjs"), true);
	});
