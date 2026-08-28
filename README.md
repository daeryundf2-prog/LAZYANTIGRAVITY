# LAZYANTIGRAVITY

AI agent orchestration plugin for [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity).

Built on ideas from [Ouroboros](https://github.com/Q00/ouroboros) and [lazycodex](https://github.com/code-yeongyu/lazycodex), tuned for **Gemini 3.7 Flash** as the default planner + coding workhorse.

[![Antigravity Plugin](https://img.shields.io/badge/Antigravity-Plugin-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)](https://github.com/google-gemini/antigravity)
[![Gemini 3.7 Flash](https://img.shields.io/badge/Gemini%203.7%20Flash-Plan%20%2B%20Code-00d4ff?style=for-the-badge&logo=google-gemini&logoColor=white)](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-3-7-flash/)
[![Version](https://img.shields.io/badge/version-0.6.0-black?style=for-the-badge)](./package.json)

## Why this plugin

| Without lazyantigravity | With lazyantigravity |
| :--- | :--- |
| Subagents isolated without IPC | **Local IPC Daemon Bridge & In-Memory Blackboard** (token-authed, replay-protected local scratchpad over a Unix socket / named pipe) |
| No code map between sessions | **Pre-emptive Symbol & Call-Graph Indexer** (regex-based and approximate; caches a symbol/call graph for lookups and blast-radius hints) |
| Linear conversation without undo | **Git-Backed Session Tree Forker** (shadow git snapshots & non-destructive hypothesis branching) |
| Repetitive errors across sessions | **Active Learning Rule Evolver** (telemetry-driven auto-promotion of `⚠️ [Gotchas]`) |
| Single agent, single task | **35 skills** (+ aliases) for ULW, review, memory, visual loopback, refactor |
| Fixed token budget & bloated context | **Adaptive Thinking Budget & Code Skeletonizer** (keyword-tiered budget directive injected into context + brace-based skeleton preview; the budget is a hint to the model, not an enforced limit) |
| Parallel multi-agent file collisions | **Dynamic Worktree Swarm** (helper script for isolated git worktrees + squash-merge workflow) |
| Fake passing tests (False Greens) | **Mutation Testing Gate** (lightweight single-file mutate/run/restore loop; not a Stryker-class engine) |
| Single-model review blindness | **Dual-Model Consensus Gate** (3-4 adversarial reviewer personas; live dispatch requires `--live` + an OpenCode-compatible endpoint, otherwise ledger events only) |
| Heavy overhead on simple tasks | **Quick-Lane Fast-Pass** for direct execution without subagent overhead |
| Context lost across sessions | **Local Active Memory (`facts.jsonl`)** for persistent working memory |
| Flaky timing failures | **5-Parallel Flaky Guard** stress-runner for deterministic hardening |
| Visual defects unnoticed | **Headless Visual Loopback** with Gemini 3.7 Native Vision QA |
| No quality gates | **7 hook events / 25 command hooks** (rules, memory, quick-lane, adaptive-reasoning, daemon, ast-index, session-tree, active-learning) |
| Manual model guessing | **Pass `Subagents[].Model` on `invoke_subagent`** (session Flash; `flash`/`pro` hints) |
| Lost progress on quota interrupts | **Safe-resume checkpoints** via `/ulw resume` |
| Weak evidence discipline | **Evidence-bound ULW loop** - claims need local proof |

## Recommended models (Antigravity)

Keep the **session UI** on **Gemini 3.7 Flash (High)**. Pass `invoke_subagent` `Subagents[].Model` (`flash` / `pro` / `flash_lite`). That is an agent hint (`canTierRoute=true`, `hostEnforced=false`). Antigravity does not rewrite the session UI model (`canAutoRoute=false`).

| Role | Recommendation |
| :--- | :--- |
| **Session default / planner / worker / researcher** | **Gemini 3.7 Flash (High)** + `Model: "flash"` |
| Verify / adversarial review | `Model: "pro"` (Gemini 3.1 Pro family hint) |
| Rapid iterative bug fixes | Gemini 3.7 Flash (Medium) or `Model: "flash_lite"` |
| Escape hatch (ambiguous, high-stakes design only) | Claude Opus 4.6 (Thinking) via manual UI switch |

`model-catalog.json` encodes these defaults and `antigravity.tierMap`. Run most ULW sessions entirely with a Flash parent and Pro verify lanes.

## ULW CLI on Antigravity

Prefer the plugin-bundled CLI (PATH `omo` is optional):

```powershell
node "$env:USERPROFILE\.gemini\config\plugins\lazyantigravity\components\ulw-loop\dist\cli.js" ulw-loop help
```

```bash
node "$HOME/.gemini/config/plugins/lazyantigravity/components/ulw-loop/dist/cli.js" ulw-loop help
```

Checkpoints write to `.omo/ulw-loop/checkpoints/` (legacy `.lazycodex/checkpoints/` is still read). Full workflow: `skills/ulw-loop/references/full-workflow.md`.

## Quick start

### Windows PowerShell

```powershell
mkdir $env:USERPROFILE\.gemini\config\plugins -Force
cd $env:USERPROFILE\.gemini\config\plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

### macOS / Linux

```bash
mkdir -p ~/.gemini/config/plugins
cd ~/.gemini/config/plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

Restart Antigravity, then use `/ulw` or `/ulw-loop`.

![LazyAntigravity ULW command picker](assets/readme/lazyantigravity-ulw-command.png)

![LazyAntigravity ULW run in progress](assets/readme/lazyantigravity-ulw-running.png)

## Core commands

| Command | Purpose |
| :--- | :--- |
| `/ulw` / `ultrawork` | Evidence-bound implement → test → fix loop |
| `/ulw-loop` | Multi-goal orchestration with checkpoints |
| `/ulw resume` | Resume after quota/model interruption |
| `/init-deep` | Generate hierarchical `AGENTS.md` context |

## What ships in this tree

### Components (11)

1. `adaptive-reasoning` — Keyword-tiered thinking-budget directive & brace-based code skeletonizer
2. `quick-lane` — Fast-pass low-complexity task execution
3. `memory` — Local active memory & facts persistence (`facts.jsonl`)
4. `comment-checker` — Comment preservation after edits
5. `rules` — Project rule injection
6. `lsp` — Local LSP-backed MCP tools
7. `ultrawork` — ULW keyword / directive injection
8. `ulw-loop` — Goals, evidence, checkpoints
9. `telemetry` — **Opt-in** daily-active telemetry
10. `start-work-continuation` — Resume helpers
11. `git-bash` — Git Bash MCP recommendation hooks

### Skills (35)

`active-learning`, `active-memory`, `adaptive-reasoning`, `arch-guard`, `ast-refactor`, `comment-checker`, `debugging`, `dual-verify`, `flaky-guard`, `frontend-ui-ux`, `git-master`, `hypothesis-tree`, `image-prompt`, `information-density`, `init-deep`, `lcx-report-bug`, `lsp`, `programming`, `refactor`, `remove-ai-slops`, `repo-survey`, `report-bug`, `review-work`, `rules`, `self-audit`, `session-persistence`, `start-work`, `swarm-sync`, `ui-loopback`, `ultra-research`, `ulw`, `ulw-loop`, `ulw-plan`, `vector-diagram`, `visual-qa`

Aliases: `ulw`, `information-density`, `session-persistence`, `lcx-report-bug`

### MCP

**Default (local only):** `ast_grep`, `git_bash`, `lsp`

**Local browser tooling (opt-in):** `playwright` ??merge from `mcp_config.playwright.example.json` into `mcp_config.json` / `.mcp.json` when you want real-browser QA. Playwright MCP runs **locally** (no network egress; the browser runs on your machine) and powers the browser channel in `visual-qa` / `ui-loopback`. First run downloads browser binaries (`npx playwright install chromium`).

**Remote helpers (opt-in):** `grep_app`, `context7` ??merge from `mcp_config.remote.example.json` into `mcp_config.json` / `.mcp.json` only if you accept remote query egress. Remote servers are **off by default** so air-gapped and secrets-sensitive sessions stay local.

## Local evidence commands

```bash
npm run doctor -- --json
npm run hooks:report -- --json
npm run mcp:status -- --json
npm run provenance -- --json
npm run evidence:map -- --json
npm test
```

Claims in docs should map to local files/scripts. Prefer these commands over marketing checklists.

## Telemetry (opt-in)

Nothing is sent unless you opt in.

```bash
# env (any one)
export LAZYANTIGRAVITY_TELEMETRY_OPT_IN=1
export OMO_SEND_ANONYMOUS_TELEMETRY=1
```

Marker file:

```bash
# macOS / Linux
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/lazyantigravity"
touch "${XDG_DATA_HOME:-$HOME/.local/share}/lazyantigravity/.telemetry-opt-in"
```

```powershell
# Windows
$dir = Join-Path $env:LOCALAPPDATA "lazyantigravity"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
New-Item -ItemType File -Force -Path (Join-Path $dir ".telemetry-opt-in") | Out-Null
```

Disable again with `LAZYANTIGRAVITY_TELEMETRY_DISABLE=1` (or `OMO_DISABLE_POSTHOG=1`).  
`POSTHOG_API_KEY` must be provided by you when opted in; the bundle does not ship a default key.

When opted in, exactly one event per UTC day is sent (`lazyantigravity_daily_active`) containing: a random persisted machine UUID, package name/version, Node version, OS platform/release/arch, CPU count and model, total RAM (rounded GB), locale, timezone, `$SHELL`, `$TERM_PROGRAM`, and a CI flag. No file paths, prompts, code content, or hostnames are collected.

## Build

```bash
npm test
npm run build
npm run check
```

## Honest limitations

- **Consensus gate**: without `--live` and an OpenCode-compatible endpoint (`@opencode-ai/sdk` is an optional peer dependency you must provide), checkpoints that require consensus **fail closed** into `needs_user_decision` — they never auto-approve. The bundled mock client exists for tests/dry-runs only.
- **Symbol index**: `ast-index` is a regex-based heuristic indexer; it can misparse strings, template literals, and multi-line signatures.
- **Session tree**: snapshots capture the full working tree (including untracked files) via a temporary index, without touching your real index or HEAD. Very large repositories may exceed hook timeouts.
- **comment-checker**: the hook shells out to the external `@code-yeongyu/comment-checker` binary (declared as an optional dependency). When it is not installed, the hook degrades to `status: "missing"` and performs no comment checks.
- **Network sandbox**: `auditEgressRequest` is a library helper used by tests; no hook or MCP server enforces network egress today. Remote MCP servers stay off unless you merge the example configs.

## Notes on routing

- Antigravity: pass `Subagents[].Model` on `invoke_subagent` (`canTierRoute=true`, `hostEnforced=false`, `routingMode=agent-tier-hint`). There is no `model_tier` field.
- Session UI model is not auto-rewritten per role (`canAutoRoute=false`)
- Do not claim the host switched models just because a skill passed `Model`

## License

MIT (see component `LICENSE` files where present).
