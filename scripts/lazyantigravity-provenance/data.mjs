export const buildSteps = [
	{
		id: "component-workspace-build",
		owner: "aggregate build",
		command: "node scripts/build-components.mjs",
		description: "Runs each component workspace build script and produces component dist bundles.",
	},
	{
		id: "bundled-mcp-runtime-build",
		owner: "aggregate build",
		command: "node scripts/build-bundled-mcp-runtimes.mjs",
		description: "Builds or verifies bundled MCP runtime package outputs.",
	},
	{
		id: "skill-sync",
		owner: "aggregate build",
		command: "node scripts/sync-skills.mjs",
		description: "Rebuilds aggregate skills from component skills and shared-skills.",
	},
	{
		id: "telemetry-component-sync",
		owner: "telemetry component sync",
		command: "node plugins/scripts/sync-telemetry-component.mjs",
		description: "Copies selected upstream telemetry sources into the telemetry component.",
	},
];

export const runtimeSurfaces = [
	{
		path: "ast-grep-mcp",
		kind: "mcp-runtime",
		owner: "ast-grep MCP runtime package",
		build_step: "bundled-mcp-runtime-build",
		expected_target: "src/packages/ast-grep-mcp",
	},
	{
		path: "git-bash-mcp",
		kind: "mcp-runtime",
		owner: "git-bash MCP runtime package",
		build_step: "bundled-mcp-runtime-build",
		expected_target: "src/packages/git-bash-mcp",
	},
	{
		path: "lsp-tools-mcp",
		kind: "mcp-runtime",
		owner: "LSP tools MCP runtime package",
		build_step: "bundled-mcp-runtime-build",
		expected_target: "src/packages/lsp-tools-mcp",
	},
	{
		path: "shared-skills",
		kind: "shared-skills",
		owner: "shared skills package",
		build_step: "skill-sync",
		expected_target: "src/packages/shared-skills",
	},
];

export const buildScriptSurfaces = [
	{
		path: "scripts/build-components.mjs",
		kind: "build-script",
		owner: "aggregate component build",
		build_step: "component-workspace-build",
	},
	{
		path: "scripts/build-bundled-mcp-runtimes.mjs",
		kind: "build-script",
		owner: "bundled MCP runtime build",
		build_step: "bundled-mcp-runtime-build",
	},
	{
		path: "scripts/sync-skills.mjs",
		kind: "build-script",
		owner: "aggregate skill sync",
		build_step: "skill-sync",
	},
	{
		path: "plugins/scripts/sync-telemetry-component.mjs",
		kind: "build-script",
		owner: "telemetry component source sync",
		build_step: "telemetry-component-sync",
	},
];
