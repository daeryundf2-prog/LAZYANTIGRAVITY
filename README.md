# LAZYANTIGRAVITY

AI agent orchestration plugin for [Google Antigravity (Gemini CLI)](https://github.com/google-gemini/antigravity).

It gives your coding agent durable workspace memory, evidence-bound work loops with quality gates, sandboxed local tools, and a review pipeline — everything local, no telemetry unless you opt in, no network egress by default. Built on ideas from [Ouroboros](https://github.com/Q00/ouroboros) and [lazycodex](https://github.com/code-yeongyu/lazycodex), tuned for **Gemini 3.7 Flash**.

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

Five session-start hooks run in under a second and stay silent unless they have something useful to inject: project rules load, your persisted memory loads, the IPC daemon starts, and the symbol index pre-builds. Then:

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

Keep the **session UI** on **Gemini 3.7 Flash (High)**. Pass `invoke_subagent` `Subagents[].Model` (`flash` / `pro` / `flash_lite`) — that is an agent hint, the host never rewrites your session model.

| Role | Recommendation |
| :--- | :--- |
| Session default / planner / worker | **Gemini 3.7 Flash (High)** + `Model: "flash"` |
| Verify / adversarial review | `Model: "pro"` |
| Rapid iterative fixes | Flash (Medium) or `Model: "flash_lite"` |

## What ships in this tree

- **15 components** — rules engine, active memory, quick-lane, adaptive reasoning, comment checker, LSP feedback, ULW loop (evidence ledger + checkpoints + consensus), telemetry (opt-in), daemon bridge (token-authed IPC blackboard), symbol index, session tree (shadow-git snapshots), active learning, and helpers.
- **13 workflow skills + 2 aliases** — every former component-manual skill now lives in its component's README; absorbed workflows are preserved as references inside the skill that owns them.
- **5 bundled local MCP servers** — `git_bash` (workspace-confined, read-only-by-default git policy, no shell chaining), `ast_grep` (tree-sitter structural search/replace when the optional `@ast-grep/napi` dependency is installed, regex fallback otherwise), `lsp` (compiler diagnostics), `workspace` (memory search, blackboard, session tree), `media` (ffprobe metadata, ffmpeg frame extraction for native-vision analysis, tesseract OCR kor+eng, whisper.cpp transcription; `media_youtube` via yt-dlp is the one network tool and requires the `LAZYANTIGRAVITY_MEDIA_NETWORK=1` opt-in). Remote MCP servers ship as opt-in examples only.

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
npm run bench                      # measured: daemon IPC set+get p50 0.207ms (n=500); ast-index lookups
```

## Telemetry (opt-in)

Nothing is sent unless you opt in with `LAZYANTIGRAVITY_TELEMETRY_OPT_IN=1` (or a marker file) **and** provide your own `POSTHOG_API_KEY`. One event per UTC day: a random machine UUID, OS/CPU/RAM metadata, locale, timezone, `$SHELL`, terminal, CI flag. No paths, prompts, code, or hostnames. Disable with `LAZYANTIGRAVITY_TELEMETRY_DISABLE=1`.

## Honest limitations

- **Consensus gate**: two live transports — the OpenCode endpoint (`--live`, optional `@opencode-ai/sdk` peer dependency) and the host-subagent transport (`consensus-pending` → `invoke_subagent` → `report-consensus-result` → `aggregate-consensus`). Without either, checkpoints that require consensus **fail closed** into `needs_user_decision` — never auto-approve.
- **Symbol index**: regex-based and approximate; it can misparse strings, template literals, and multi-line signatures.
- **Session tree**: snapshots capture the full working tree (including untracked files) via a temporary index without touching your index or HEAD; very large repos may exceed hook timeouts. `prune [--keep N]` manages ref growth.
- **comment-checker**: shells out to the external `@code-yeongyu/comment-checker` binary (optional dependency); without it the hook degrades to `status: "missing"`.
- **Network sandbox**: `auditEgressRequest` is a library helper; nothing enforces egress at runtime today. Remote MCP servers stay off unless you merge the example configs.
- **Windows**: exercised by a non-blocking CI probe job; the named-pipe IPC paths are implemented but not yet proven green on a Windows runner.

## Development

```bash
npm install && npm run check   # full gate
npm test                       # root suites only
npm run test:components        # per-component suites
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository rules (dist sync, 250-LOC ceiling, fail-open allowlist, evidence-backed docs) and [CHANGELOG.md](CHANGELOG.md) for release history.

## Notes on routing

- Antigravity: pass `Subagents[].Model` on `invoke_subagent` (`canTierRoute=true`, `hostEnforced=false`, `routingMode=agent-tier-hint`). There is no `model_tier` field.
- Do not claim the host switched models just because a skill passed `Model`.

## License

MIT (see component `LICENSE` files where present).
