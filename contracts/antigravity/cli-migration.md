---
slug: cli/gcli-migration
section: Antigravity CLI
title: Migration
path:
    - Antigravity CLI
    - Gemini Migration
---

# Migrating from Gemini CLI

Convert your legacy configurations, import Gemini CLI extensions as native plugins, adapt custom skills paths, and reformat Model Context Protocol configurations.

## Overview

Antigravity CLI preserves backward compatibility with the core developer-experience constructs popularized by Gemini CLI. To ensure a seamless upgrade, the CLI offers automatic onboarding conversion alongside explicit CLI migration command sequences.

## First-launch onboarding

When you execute `agy` for the first time in an environment containing legacy configurations, the CLI automatically detects your existing profiles. An interactive checklist prompts you to choose which assets to migrate:

1. **Auto-conversion**: Select the extensions and global configurations you wish to convert.
2. **Keyring storage**: The CLI migrates your active session tokens securely into your operating system's native keyring storage.
3. **Settings alignment**: Default visual parameters and rendering buffers map automatically to your new settings profile.

<Announcement>
icon: info
iconColor: var(--theme-primary)
color: var(--theme-surface-surface-container)
text: **Partial Parity**: While we preserve support for workspace skills, rules, and MCP servers, certain customized terminal themes or experimental visual overlays from Gemini CLI may not be supported.
</Announcement>

## Converting extensions to plugins

Since Gemini CLI launched, the industry has standardized on the term **plugins**. You can manually convert your legacy Gemini extensions to native Antigravity plugins by executing:

```bash
agy plugin import gemini
```

This utility searches your legacy local directories, parses your extension manifests, and converts files into native layout blocks.

### Expected import output

```text
[ok]   conductor-tools
       - skills     : skipped (none detected)
       - agents     : skipped (none detected)
       ✔ commands   : 4 legacy commands converted to skills
       - mcpServers : skipped (none detected)
[ok]   google-workspace
       ✔ skills     : 5 skills processed
       - agents     : skipped (none detected)
       ✔ commands   : 2 legacy commands converted to skills
       ✔ mcpServers : 1 server definition migrated to mcp_config.json
```

## Context files and workspace rules

Both CLI platforms utilize identical workspace context rules. No modifications are needed to your existing rule documents:

- **Workspace local context**: The agent continues to parse and enforce rule constraints defined inside your active directory's `GEMINI.md` and `AGENTS.md` files.
- **Global developer context**: The agent automatically consults and enforces your global constraints located at `~/.gemini/GEMINI.md`.

## Updated skills paths

While global shared skills remain in your user home directory, the target folder path for local workspace-specific skills has been updated.

| Configuration              | Gemini CLI          | Antigravity CLI                     |
| :------------------------- | :------------------ | :---------------------------------- |
| **Global shared path**     | `~/.gemini/skills/` | `~/.gemini/antigravity-cli/skills/` |
| **Workspace project path** | `.gemini/skills/`   | `.agents/skills/`                   |

<Announcement>
icon: warning
iconColor: var(--theme-primary)
color: var(--theme-surface-surface-container)
text: **Action Required**: If your project contains custom workspace skills defined in `.gemini/skills/`, you must manually rename or relocate the folder to `.agents/skills/` for the Antigravity agent to recognize them as active slash commands.
</Announcement>

## MCP config formatting changes

Antigravity CLI separates Model Context Protocol servers into dedicated, lightweight JSON profiles instead of nesting them inside your primary preferences configuration.

### Directory mapping

- **Legacy Gemini Config**: Servers were declared inline within `~/.gemini/settings.json`.
- **Antigravity CLI Config**: Servers are defined inside a standalone `mcp_config.json` profile:
    - Global servers: `~/.gemini/config/mcp_config.json`
    - Workspace servers: `.agents/mcp_config.json`

### Required schema updates

When manually migrating remote websocket or SSE server definitions, update the URI key parameter to match the current standard:

- **Legacy schema keys**: `url` or `httpUrl`
- **Modern schema key**: `serverUrl`

```json
{
    "mcpServers": {
        "remote-indexer": {
            "serverUrl": "https://mcp.internal.enterprise.com/sse",
            "env": {
                "AUTH_TOKEN": "secure_alpha_token"
            }
        }
    }
}
```

## Next steps

Begin configuring your new visual parameters and troubleshooting any setup anomalies:

- **[Settings, Rendering & Keybindings](/docs/cli/settings)**: Customize keyboard hotkeys, themes, and screen buffers.
- **[Troubleshooting](/docs/cli/troubleshooting)**: Learn how to resolve authentication lockouts or path issues.
- **[CLI Reference](/docs/cli/reference)**: Access standard parameters lists and slash command mappings.
