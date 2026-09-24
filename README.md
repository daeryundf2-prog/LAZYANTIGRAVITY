# LAZYANTIGRAVITY (v0.7.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Reproducible Builds](https://img.shields.io/badge/Builds-Reproducible-success.svg?style=flat-square)](package.json)
[![Architecture: Agentic Core](https://img.shields.io/badge/Architecture-Agentic%20Core-orange.svg?style=flat-square)](AGENTS.md)

> **Deterministic Multi-Agent Orchestration Framework & Maintainer Automation Layer**  
> Bringing durable workspace memory, evidence-bound work loops with fail-closed quality gates, zero-latency IPC state bridges, and automated maintainer pipelines to modern agentic coding environments.

Originating from concepts in [lazycodex](https://github.com/code-yeongyu/lazycodex) and [Ouroboros](https://github.com/Q00/ouroboros), LAZYANTIGRAVITY provides a model-agnostic, developer-first orchestration architecture that enforces deterministic verification over probabilistic hallucinations. It is optimized for high-throughput agent runtimes ([Google Antigravity / Gemini CLI](https://github.com/google-gemini/antigravity)) with native extension pathways for OpenAI Codex and multi-agent CI/CD bots.

Local-first by default: telemetry and startup update checks stay disabled unless explicitly opted in, and `LAZYANTIGRAVITY_OFFLINE=1` suppresses every application-level egress path. This is an application-level policy, not an OS-level network sandbox.

## Install

```bash
# macOS / Linux
mkdir -p ~/.gemini/config/plugins
cd ~/.gemini/config/plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity

# Windows PowerShell
mkdir $env:USERPROFILE\.gemini\config\plugins -Force
cd $env:USERPROFILE\.gemini\config\plugins
git clone https://github.com/daeryundf2-prog/LAZYANTIGRAVITY.git lazyantigravity
```

Restart Antigravity. No build step — compiled artifacts are committed and verified against sources (`npm run verify:reproducible`).

## What happens in your first session

Six session-start hook commands are registered: project rules, persisted working memory, the IPC daemon, symbol indexing, opt-in telemetry, and an opt-in update check. Full host cold-start latency has not been measured; hook timeouts are limits, not latency guarantees. Then:

- **Ask a quick question** — a quick-lane classifier skips the heavy orchestration for one-line queries.
- **Edit a file** — LSP/compiler diagnostics and comment-preservation checks run automatically; clean edits stay silent, real findings are fed back to the agent immediately.
- **Run `/ulw`** — the agent plans goals with success criteria, executes, and can only report "complete" with evidence that verifies against your actual workspace (file checksums, exit-0 command audits, a host execution binding). Anything unverified fails closed into a human decision, never a fake green.
- **Come back tomorrow** — decisions and learned gotchas persist in `.lazyantigravity/memory/facts.jsonl` and are searched again next session.

## Core commands

| Command | Purpose |
| :--- | :--- |
| `/ulw` / `ultrawork` | Evidence-bound implement → test → fix loop |
| `/ulw-loop` | Multi-goal orchestration with checkpoints and resume (`/ulw resume` after quota interrupts) |
| `/ulw-plan` | Explore-first planning; waits for your explicit approval before producing a plan |
| `/init-deep` | Generate hierarchical `AGENTS.md` context for the repo |
| `/debugging`, `/review-work`, `/visual-qa`, `/report-bug` | Focused workflows for the common jobs |

## ULW CLI on Antigravity

![LazyAntigravity ULW command picker](assets/readme/lazyantigravity-ulw-command.png)

![LazyAntigravity ULW run in progress](assets/readme/lazyantigravity-ulw-running.png)

The agent-side CLI (for scripts or manual runs):

```bash
node "$HOME/.gemini/config/plugins/lazyantigravity/components/ulw-loop/dist/cli.js" ulw-loop status
# subcommands: create-goals, status, checkpoint, ledger, resume, dispatch-consensus, consensus-pending, ...
```

## Recommended models (Antigravity)

Keep the **session UI** on **Gemini 3.8 Flash (High)**. Pass `invoke_subagent` `Subagents[].Model` (`flash` / `pro` / `flash_lite`) — that is an agent hint, the host never rewrites your session model.

| Role | Recommendation |
| :--- | :--- |
| Session default / planner / worker | **Gemini 3.8 Flash (High)** + `Model: "flash"` |
| Verify / adversarial review | `Model: "pro"` |
| Rapid iterative fixes | Flash (Medium) or `Model: "flash_lite"` |

## What ships in this tree

- **15 components** — rules engine, active memory, quick-lane, adaptive reasoning, comment checker, LSP feedback, ULW loop (evidence ledger + checkpoints + consensus), telemetry (opt-in), daemon bridge (token-authed IPC blackboard), symbol index, session tree (shadow-git snapshots), active learning, and helpers.
- **19 shared workflow skills** — authored in `shared-skills/skills/` and materialized into `skills/` (`npm run sync:skills`, CI-checked). Plus component-owned materializations (`ulw-loop`, `ulw-plan`, `references`).
- **7 bundled local MCP servers** — `git_bash` (workspace-confined, read-only-by-default git policy, no shell chaining), `ast_grep` (tree-sitter structural search/replace when the optional `@ast-grep/napi` dependency is installed; structural requests fail closed without it — `regex=true` selects explicit line-based regex, never a silent fallback), `lsp` (compiler diagnostics), `workspace` (memory search, blackboard, session tree), `media` (ffprobe metadata, ffmpeg frame extraction for native-vision analysis, tesseract OCR kor+eng, whisper.cpp transcription with an opt-in `backend=gemini` path to Gemini 3.5 Transcribe; `media_youtube` via yt-dlp requires `LAZYANTIGRAVITY_MEDIA_NETWORK=1`, and the gemini backend — which uploads audio — requires `LAZYANTIGRAVITY_MEDIA_EXTERNAL_STT=1`, `GEMINI_API_KEY`, and a per-call `confirmNotClientData=true` attestation after asking the user; any denial falls back to local whisper automatically, and `LAZYANTIGRAVITY_MEDIA_LOCAL_ONLY_DIRS` hard-blocks workspace subdirs from upload), `research` (web_read via Jina Reader/direct fetch, web_search via provider chain Tavily/Brave/Jina/DuckDuckGo, fetch_json for public APIs with SSRF protection; requires `LAZYANTIGRAVITY_RESEARCH_NETWORK=1`), `korean_law_offline` (local statute/precedent lookup). Remote MCP servers (`notebooklm` via `npx`, grep_app, context7) ship in `mcp_config.remote.example.json` only. `npx` servers are classified `remote-npx`, never `local-bundled`.

## Evidence, not claims

Every number and behavior in these docs maps to a command you can run:

```bash
npm run check                      # build + hook policies + root tests + all 15 component suites
npm run verify:reproducible        # committed dist must match sources 100%
npm run doctor -- --json           # manifest / hook / MCP / skill integrity
npm run hooks:report -- --json     # every command hook, classified and observable
npm run mcp:status -- --json       # every local MCP server, classified
npm run mcp:status -- --probe      # actually handshakes with each local MCP server
npm run provenance -- --json       # product / generated / vendored provenance
npm run evidence:map -- --json     # docs claims mapped to their local evidence
npm run bench                      # daemon IPC + ast-index benchmark; starts a sandbox daemon
npm run bench:hooks                # warm pure hook paths only; not full host cold startup
npm run bench:hooks -- --update-readme   # refresh the measured table below
```

### Hook-path benchmark (measured)

<!-- BENCH_HOOKS:START -->

Measured 2026-09-24 on Node v24.19.0 (win32), baseline e7a294d. Values are µs/call batch means.

| Hook path | p50 current | p95 current | p50 baseline |
|---|---|---|---|
| `payloadNormalization` | 2.3 | 6.5 | 2.3 |
| `shellPermissionPolicy` | 0.6 | 1.6 | 0.6 |
| `workingMemoryFormatting` | 0.5 | 1.3 | 0.5 |
| `evidenceContractValidation` | 2.6 | 4.3 | 2.5 |

_Warm in-process synthetic function comparison, alternating batch order. Includes loop/timer overhead; percentiles describe batch means, not individual calls. No host, cold startup, network, daemon, filesystem operation, or subprocess latency measured. Different outputs are not equivalent-work speedups. No performance threshold or improvement claim._

<!-- BENCH_HOOKS:END -->

## Offline profile

Set `LAZYANTIGRAVITY_OFFLINE=1` to override startup update checks, automatic/manual updater execution, and telemetry opt-ins. Startup fetching otherwise requires `LAZYANTIGRAVITY_UPDATE_CHECK=1`. This application-level switch is not a firewall: arbitrary shell commands, external tools, and separately configured MCP servers need their own network controls.

ULW evidence drafts remain `not_checked`, with no invented exit codes or output fingerprints. Completion checks submitted commands and bindings against local host-executor records, not agent `verified` fields alone. These records assume trusted host code and storage; a process that can rewrite the plugin and its evidence storage is outside that trust boundary. Memory is editable working context, not verified evidence.

## Telemetry (opt-in)

Nothing is sent unless you opt in with `LAZYANTIGRAVITY_TELEMETRY_OPT_IN=1` (or a marker file) **and** provide your own `POSTHOG_API_KEY`. One event per UTC day: a random machine UUID, OS/CPU/RAM metadata, locale, timezone, `$SHELL`, terminal, CI flag. No paths, prompts, code, or hostnames. Disable with `LAZYANTIGRAVITY_TELEMETRY_DISABLE=1`.

## Honest limitations

- **Consensus gate**: two live transports — the OpenCode endpoint (`--live`, optional `@opencode-ai/sdk` peer dependency) and the host-subagent transport (`consensus-pending` → `invoke_subagent` → `report-consensus-result` → `aggregate-consensus`). Without either, checkpoints that require consensus **fail closed** into `needs_user_decision` — never auto-approve.
- **Symbol index**: regex-based and approximate; it can misparse strings, template literals, and multi-line signatures.
- **Session tree**: snapshots capture working files (including untracked files), excluding `.lazyantigravity`, `.lazycodex`, and `.omo` evidence/state directories, via a temporary index without touching your index or HEAD. Transactions lock before reading graph state and publish it atomically. `prune [--keep N]` trims recent snapshot refs; separate history refs retain graph-referenced commits, so pruning does not promise disk reclamation. Very large repos may exceed hook timeouts.
- **comment-checker**: shells out to the external `@code-yeongyu/comment-checker` binary (optional dependency); without it the hook degrades to `status: "missing"`.
- **Network sandbox**: `auditEgressRequest` is a library helper; nothing enforces egress at runtime today. Remote MCP servers stay off unless you merge the example configs.
- **Windows**: the Node 22 probe is a blocking CI job (no `continue-on-error`); configuration alone does not establish a green Windows run.

## Development

```bash
npm ci --ignore-scripts && npm run check   # locked dependencies + full gate
npm test                       # root suites only
npm run test:components        # per-component suites
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository rules (dist sync, 250-LOC ceiling, fail-open allowlist, evidence-backed docs) and [CHANGELOG.md](CHANGELOG.md) for release history.

## Notes on routing

- Antigravity: pass `Subagents[].Model` on `invoke_subagent` (`canTierRoute=true`, `hostEnforced=false`, `routingMode=agent-tier-hint`). There is no `model_tier` field.
- Do not claim the host switched models just because a skill passed `Model`.

## Lazy ecosystem (repo boundaries)

- `LAZYANTIGRAVITY` (this repo) — runtime umbrella: hook aggregation, shared-skill materialization, bundled MCP runtimes
- `lazyforensic` — forensic / Korean-law domain plugin
- `lazyothers` — legal-document / HWP / humanize domain plugin
- `lazyagentic` — rules-only governance plugin (Dual-Mount `~/agentic`)
- [`korean-law-mcp`](https://github.com/daeryundf2-prog/korean-law-mcp) — Korean-law MCP server (full API version), cloned+built by lazyforensic. This repo's own `korean-law-mcp/` package is a separate offline grounding fallback, not a build of that repo — see `korean-law-mcp/README.md`.

Shared asset: `scripts/coverage_audit.mjs` is kept byte-identical across lazyforensic (canonical), lazyothers, and LAZYANTIGRAVITY — sync all three on change.

## License

MIT (see component `LICENSE` files where present).
