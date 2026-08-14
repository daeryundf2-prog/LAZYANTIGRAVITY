# LAZYANTIGRAVITY

AI agent orchestration plugin for [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity).

Built on ideas from [Ouroboros](https://github.com/Q00/ouroboros) and [lazycodex](https://github.com/code-yeongyu/lazycodex), tuned for **Gemini 3.7 Flash** as the default coding workhorse.

[![Antigravity Plugin](https://img.shields.io/badge/Antigravity-Plugin-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)](https://github.com/google-gemini/antigravity)
[![Gemini 3.7 Flash](https://img.shields.io/badge/Gemini%203.7%20Flash-Main%20Coder-00d4ff?style=for-the-badge&logo=google-gemini&logoColor=white)](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-3-7-flash/)
[![Version](https://img.shields.io/badge/version-0.3.0-black?style=for-the-badge)](./package.json)

## Why this plugin

| Without lazyantigravity | With lazyantigravity |
| :--- | :--- |
| Single agent, single task | **20 skills** (+ aliases) for ULW, review, refactor, visual QA, and more |
| No quality gates | **7 hook events / 15 command hooks** (rules, comments, LSP, ULW steering) |
| Manual model guessing | **Model catalog hints** — Gemini 3.7 Flash as default main coder |
| Lost progress on quota interrupts | **Safe-resume checkpoints** via `/ulw resume` |
| Weak evidence discipline | **Evidence-bound ULW loop** — claims need local proof |

## Recommended models (Antigravity)

Antigravity does **not** auto-switch models per role (`canAutoRoute: false`). Pick one model in the UI; subagents inherit it.

| Role | Recommendation |
| :--- | :--- |
| **Default / main coder / worker** | **Gemini 3.7 Flash (High)** |
| Rapid iterative bug fixes | Gemini 3.7 Flash (Medium) |
| Deep planning (optional) | Claude Opus 4.6 (Thinking) |
| Cross-model verification | Gemini 3.1 Pro (High) |

`model-catalog.json` encodes these hints. Prefer **3.7 Flash** for day-to-day coding loops; keep **3.1 Pro** for verifier diversity, not as the primary coder.

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

### Components

1. `comment-checker` — comment preservation after edits
2. `rules` — project rule injection
3. `lsp` — local LSP-backed MCP tools
4. `ultrawork` — ULW keyword / directive injection
5. `ulw-loop` — goals, evidence, checkpoints
6. `telemetry` — **opt-in** daily-active telemetry
7. `start-work-continuation` — resume helpers
8. `git-bash` — Git Bash MCP recommendation hooks

### Skills (20)

`comment-checker`, `debugging`, `frontend-ui-ux`, `git-master`, `image-prompt`, `information-density`, `init-deep`, `lcx-report-bug`, `lsp`, `programming`, `refactor`, `remove-ai-slops`, `review-work`, `rules`, `session-persistence`, `start-work`, `ulw`, `ulw-loop`, `ulw-plan`, `visual-qa`

Aliases: `ulw`, `information-density`, `session-persistence`

### MCP

Bundled/local: `ast_grep`, `git_bash`, `lsp`  
Remote helpers (as configured): `grep_app`, `context7`

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

## Build

```bash
npm test
npm run build
npm run check
```

## Notes on routing

- Codex: config-driven routing (`canAutoRoute: true` in catalog)
- Antigravity: **hint-only** recommendations via skills + `model-catalog.json`
- Do not claim automatic per-role model switching on Antigravity

## License

MIT (see component `LICENSE` files where present).
