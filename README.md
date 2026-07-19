# LazyAntigravity Plugin Root (`omo`)

This directory is the aggregate **LazyAntigravity** plugin root. It packages the local `components/` harnesses, skills, hooks, MCP configuration, and report scripts for use from Google Antigravity.

## ULW in Antigravity

![LazyAntigravity ULW command picker](assets/readme/lazyantigravity-ulw-command.png)

The command picker exposes `ulw` and `ulw-loop` skills.

![LazyAntigravity ULW run in progress](assets/readme/lazyantigravity-ulw-running.png)

When ULW is active, local evidence should be captured through report commands and artifacts rather than a bare completion claim.

## Installation

Clone this repository into the Antigravity plugin directory:

```bash
cd C:\Users\<user>\.gemini\config\plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

Restart Antigravity or start a new session after cloning. The aggregate plugin exposes `/ulw` and `/ulw-loop` through the plugin skills directory.

## Components

The aggregate plugin is composed from local component packages:

1. `comment-checker`: checks generated comments after edit-like tool calls.
2. `rules`: injects project rules from AGENTS and rule files.
3. `lsp`: provides local LSP-backed MCP tools.
4. `ultrawork`: injects the ultrawork directive when a prompt asks for ULW/ultrawork.
5. `ulw-loop`: manages evidence-bound goals and local ULW state.
6. `telemetry`: handles the optional daily active telemetry hook.

## Local Evidence Commands

These commands are the supported local surfaces for checking LazyAntigravity readiness and claims:

```bash
npm run doctor -- --json
npm run hooks:report -- --json
npm run icons:report -- --json
npm run mcp:status -- --json
npm run provenance -- --json
node scripts/auto-update.mjs --status --json
npm run evidence:map -- --json
```

`doctor` checks aggregate readiness: manifests, hooks, MCP, skills, bundles, versions, and warnings.

`hooks:report` inventories aggregate and component hooks with status messages, timeout, fallback, and failure-policy fields.

`icons:report` records reviewed OSS icon-library candidates for LazyAntigravity. It currently tracks Reicon as an MIT-normalized candidate, recommends keeping it in the report/docs surface, and defers runtime dependency adoption until a concrete UI call site and icon provenance plan exist.

`mcp:status` reads `.mcp.json` and `mcp_config.json`, classifies local and remote MCP entries, and checks local targets.

`provenance` maps generated, vendored, symlinked, source-root, and build-owned surfaces without modifying them.

`auto-update --status --json` reports a non-mutating status/dry-run plan. It does not install packages or run an update command.

`evidence:map` parses README and skill text as inert local files, checks local script/config evidence, and marks each mapped claim as `verified`, `deferred`, or `removed`.

## Telemetry And Privacy Controls

Telemetry is **opt-in**. The bundled telemetry hook does not send anything to PostHog unless an explicit opt-in signal is present. To enable it, set any of these environment variables before launching the host process:

```bash
export LAZYANTIGRAVITY_TELEMETRY_OPT_IN=1   # Antigravity-native (recommended)
export OMO_SEND_ANONYMOUS_TELEMETRY=1        # Shared OMO flag
export OMO_CODEX_SEND_ANONYMOUS_TELEMETRY=1  # Legacy Codex-compat flag
```

Alternatively, create an opt-in marker file (preferred for persistent opt-in across sessions):

```bash
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/lazyantigravity"
touch "${XDG_DATA_HOME:-$HOME/.local/share}/lazyantigravity/.telemetry-opt-in"
```

When telemetry is enabled and you want to suppress it again, set any of these (the first one wins):

```bash
export LAZYANTIGRAVITY_TELEMETRY_DISABLE=1   # Antigravity-native (recommended)
export OMO_DISABLE_POSTHOG=1                  # Shared OMO flag
export OMO_CODEX_DISABLE_POSTHOG=1            # Legacy Codex-compat flag
```

The implementation of these flags is in `components/telemetry/src/env-flags.ts`, and the component tests exercise both the opt-in and disable paths. `plugin.json` declares `Telemetry` in its `capabilities` array so marketplace consumers can see before install that network calls may occur.

Telemetry diagnostics are local JSONL rows written under the component data directory as `telemetry-diagnostics.jsonl`. The diagnostics writer is `components/telemetry/src/diagnostics.ts`; it records telemetry failure metadata locally and prunes old or oversized diagnostics. The evidence map verifies this local diagnostics surface by reading the source files, not by making a network call.

The README limits its scope to the local files and commands above, including the telemetry controls and diagnostics surfaces they verify.

## Build And Test

Use the aggregate commands when changing this plugin root:

```bash
npm test
npm run build
npm run check
```

`npm run check` runs the aggregate build and test scripts. If a full check is not practical in a local environment, keep the targeted command output with the evidence artifact for the specific task.
