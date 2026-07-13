---
slug: cli/plugins
section: Antigravity CLI
title: Plugins & Skills
path:
    - Antigravity CLI
    - Customizations
    - Plugins & Skills
---

# Plugins & skills

Extend agent capabilities, install third-party extension bundles, package custom workflow skills, and interface with Model Context Protocol (MCP) servers.

## The extensibility model

Antigravity CLI is designed for limitless customization. You can augment the shared agent harness by installing structured package modules called **Plugins** or creating localized markdown blueprints called **Skills**.

These customizations allow agents to access specialized proprietary commands, invoke domain-specific subagents, and consult customized style constraints.

## Antigravity plugins

Plugins are namespaced bundles that package custom skills, background subagents, linting rules, Model Context Protocol definitions, and event hooks into a single deployable asset.

### Plugin filesystem structure

When you install or import a plugin, the CLI stages the bundle files within your global configuration path:

```text
~/.gemini/antigravity-cli/plugins/<plugin_name>/
```

A compliant plugin contains the following layout:

```text
~/.gemini/antigravity-cli/plugins/<plugin_name>/
├── plugin.json                 # Required package marker file
├── mcp_config.json             # Optional Model Context Protocol servers
├── hooks.json                  # Optional pre/post tool event hooks
├── skills/                     # Optional specialized skills directory
├── agents/                     # Optional subagent definition templates
└── rules/                      # Optional custom codebase rules files
```

### The plugin manifest (plugin.json)

The `plugin.json` file is a mandatory manifest located at the root of your
plugin directory. It defines the plugin's identity and metadata.

**Manifest example**

```json
{
    "$schema": "https://antigravity.google/schemas/v1/plugin.json",
    "name": "my-plugin",
    "description": "A brief description of what my plugin does."
}
```

**Field reference**

| Field         | Type   | Required | Description                                                                                                                                                                                                      |
| :------------ | :----- | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | String | **Yes**  | The unique, machine-readable name of the plugin. It must contain only alphanumeric characters, hyphens, and underscores (matches `^[a-zA-Z0-9-_]+$`). This name is used to reference the plugin in CLI commands. |
| `description` | String | No       | A brief human-readable description of the plugin's purpose, displayed in plugin listings.                                                                                                                        |

**Automatic validation**

To enable automatic autocomplete and validation in editors like VS Code or
WebStorm, include the `$schema` key pointing to the official schema URL:

```json
"$schema": "https://antigravity.google/schemas/v1/plugin.json"
```

**Full JSON Schema**

```json
{
    "$schema": "https://antigravity.google/schemas/v1/plugin.json",
    "title": "Antigravity Plugin Manifest",
    "description": "Schema for Antigravity CLI plugin manifest files (plugin.json)",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "description": "The unique, machine-readable name of the plugin. Must contain only alphanumeric characters, hyphens, and underscores.",
            "pattern": "^[a-zA-Z0-9-_]+$"
        },
        "description": {
            "type": "string",
            "description": "A brief human-readable description of the plugin's purpose and capabilities."
        }
    },
    "required": ["name"],
    "additionalProperties": false
}
```

### Managing plugins via CLI subcommands

The CLI exposes a `plugin` (or plural `plugins`) subcommand pipeline to manage your extensions:

- **List installed plugins**: Show active packages and their loaded components.
    ```bash
    agy plugin list
    ```
- **Install a local or remote plugin**: Stage a package directory into your local profile.
    ```bash
    agy plugin install /path/to/local/plugin
    ```
- **Disable/Enable a plugin**: Suspend a plugin's tools without deleting its assets.
    ```bash
    agy plugin disable <plugin_name>
    agy plugin enable <plugin_name>
    ```
- **Uninstall a plugin**: Purge the package directory and clean up registries.
    ```bash
    agy plugin uninstall <plugin_name>
    ```

## Agent skills

Skills are declarative, human-readable markdown files that outline explicit instruction protocols, scripts, and target resources for specialized engineering tasks.

Once registered, **Skills convert automatically into slash commands** inside the TUI, allowing you to invoke them manually (e.g., typing `/refactor-ui`).

### Creating local workspace skills

To deploy workspace-specific skills that stay with your git repository:

1. Create a directory named `.agents/skills/` at your project root.
2. Inside, draft a markdown file with a `.md` extension (such as `format-tests.md`).
3. Define the skill's Frontmatter metadata (see the example below).
4. Below the metadata, write explicit instructions for the agent. When you run `agy` in this directory, the skill is compiled, and `/format-tests` becomes available in the prompt box.

**Frontmatter example:**

```yaml
---
name: format-tests
description: Standardize and re-format Python unittest assertions
---
```

### Sharing global skills

To share skills across all workspaces on your workstation, place the target markdown files inside your global configuration path:

```text
~/.gemini/antigravity-cli/skills/
```

Any markdown skill in this directory is automatically imported as a global slash command whenever you launch `agy` in any directory.

## Managing hooks

Hooks intercept agent actions right before or immediately after execution. They are useful for running automated pre-flight checks or post-generation formats (such as running `prettier` after writing files).

Hooks are defined inside a plugin's `hooks.json` or configured inside your primary `settings.json` file. You can inspect all loaded and active hooks inside the TUI by typing:

```text
/hooks
```

## Model Context Protocol (MCP)

Model Context Protocol is an open standard enabling foundation models to interface securely with local APIs, file parsers, and custom developer tools.

For comprehensive documentation on configuring local and remote MCP servers in Antigravity CLI, accessing the interactive `/mcp` manager overlay, and understanding server schemas and authentication, see the dedicated [MCP Documentation](/docs/mcp).

## Next steps

Learn how to migrate your existing configurations from Gemini CLI and troubleshoot connection anomalies:

- **[Migration from Gemini CLI](/docs/cli/gcli-migration)**: Fast-track your legacy extensions and config conversions.
- **[Troubleshooting](/docs/cli/troubleshooting)**: Resolve terminal hook errors, lockouts, or network failures.
- **[Permissions & Sandbox](/docs/cli/sandbox)**: Configure security containment rings around your custom plugins and MCP servers.
