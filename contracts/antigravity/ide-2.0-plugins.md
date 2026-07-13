---
slug: plugins
section: Antigravity 2.0
title: Plugins
path:
  - Antigravity 2.0
  - Customizations
  - Plugins
---

# Plugins

Plugins are namespaced bundles that allow you to extend Antigravity's capabilities by grouping skills, rules, MCP servers, and hooks into a single package.

## Directory Structure

If you want to create your own plugins or inspect existing ones, they follow a specific directory structure. A plugin is a directory containing a `plugin.json` file and optional subdirectories for different customization types:

```text
plugins/<plugin-name>/
├── plugin.json       # Required marker file
├── mcp_config.json   # Optional MCP server definitions
├── hooks.json        # Optional hooks definition
├── skills/           # Optional skills
│   └── <skill-name>/
│       └── SKILL.md
└── rules/            # Optional rules
    └── <rule-name>.md
```

### Manifest File (`plugin.json`)

Every plugin must have a `plugin.json` file at its root. This file identifies the directory as a plugin.

```json
{
  "name": "my-custom-plugin"
}
```

The `name` field is optional and defaults to the directory name if omitted.

## Supported Components

A plugin can contain the following components:

1. **Skills**: Located in the `skills/` subdirectory. Each skill must have a `SKILL.md` file containing instructions for the agent.
2. **Rules**: Located in the `rules/` subdirectory. These are markdown files that define constraints or guidelines for the agent's behavior.
3. **MCP Servers**: Configured via `mcp_config.json` at the plugin root. This allows you to connect Antigravity to external tools and services.
4. **Hooks**: Configured via `hooks.json` at the plugin root. These allow you to run scripts or commands when specific events occur.

## How to Add Plugins

There are two ways to add plugins to Antigravity:

### 1. Using Bundled Plugins (Build with Google)

Antigravity comes with a variety of bundled plugins created by Google. You can browse and add these plugins directly from the user interface:

* Navigate to the **Customizations** page.
* For more details about the available Google-built plugins, see the [Build with Google Page](/docs/build-with-google).

### 2. Manually Adding Plugins

You can also add custom plugins by placing your plugin folders in one of the designated plugin locations. Antigravity automatically scans these directories to discover and load your customizations:

* **Workspace Level**: Place your plugin folder inside a `.agents/plugins/` or `_agents/plugins/` directory at the root of your opened workspace. This makes the plugin available only when working in this specific workspace.
* **Global Level**: Place your plugin folder inside `~/.gemini/config/plugins/` in your user home directory. This makes the plugin active across all workspaces.
