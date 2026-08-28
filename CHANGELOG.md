# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
semver. Given the 0.x stage, breaking changes may land in minor releases.

## [0.7.0] - 2026-08-29

### Added
- **workspace MCP server** (`workspace-mcp`, 4th bundled local server): exposes
  active memory search (`memory_search`), the token-authed IPC blackboard
  (`blackboard_get/set/list`), and the session tree (`session_tree_snapshot`,
  `session_tree_render`, `session_tree_fork`) as native MCP tools. The fork
  tool requires the `LAZYANTIGRAVITY_SESSION_TREE_FORK=1` opt-in; the blackboard
  tools fail with an actionable message when the daemon is not running.
- **Closed the active-learning feedback loop**: a best-effort failure recorder
  (`components/active-learning`) now feeds `.lazyantigravity/telemetry/events.jsonl`
  from two sources — hook failures captured by `scripts/hook-runner.mjs` and
  ulw-loop ledger failures (`quality_gate.*_failed`, `parent.hitl_required`),
  which the analyzer reads directly from `.omo/ulw-loop/runs/*/events.jsonl`.
  The `record` CLI subcommand appends events manually. Rotation caps the file
  at 2 MB (500 newest events).
- **Host-subagent consensus transport**: `ulw-loop consensus-pending` lists the
  personas dispatched for a consensus round that have not reported a verdict,
  including the exact review prompt to pass to `invoke_subagent`. Verdicts are
  reported with `report-consensus-result` and aggregated with
  `aggregate-consensus`; a checkpoint whose fingerprint matches then finalizes.
  This makes adversarial review possible on hosts without an OpenCode endpoint.
- **Real AST engine for ast-grep-mcp** (optional): with `@ast-grep/napi`
  installed (optional dependency), `ast_grep_search`/`ast_grep_replace` use
  tree-sitter structural matching — including multi-line patterns the regex
  fallback cannot see. `LAZYANTIGRAVITY_AST_ENGINE=regex` forces the fallback;
  rewrites referencing unresolved metavariables also fall back instead of
  producing wrong output.
- `session-tree prune [--keep N]`: removes all but the newest N shadow snapshot
  refs (Stop-hook checkpoints accumulate refs otherwise); the node graph keeps
  its history.
- `mcp:status --probe`: spawns each local server and performs an
  initialize + tools/list handshake, reporting tool names and latency instead
  of only checking that target files exist.
- `npm run test:components` runs all 15 component test suites (wired into CI);
  `npm run check` includes it.
- CI: production-dependency audit step and a non-blocking Windows probe job.
- `daemon start` without `--foreground` is a real background start (detached
  re-exec with PID reporting; refuses when a daemon is already running).
- Benchmarks: `npm run bench` (ast-index lookups, daemon round-trip, hook
  pipeline), replacing unsubstantiated performance claims with measurements.

### Fixed
- git-bash-mcp: rejected `!` metacharacter (git `alias`/config shell escape),
  banned global git flags, enforced a git subcommand policy (read-only by
  default; destructive/network subcommands denied; writes behind
  `LAZYANTIGRAVITY_GIT_WRITE=1`), confined cwd and path arguments to the
  workspace root, capped output at 1 MB.
- ast-grep-mcp: rejected absolute/`~` path specs, confined search and replace
  to the workspace root, followed symlinks only when their target stays inside
  the root, capped directory walks.
- lsp-tools-mcp: regex-escaped symbols from file content before RegExp
  construction; `lsp_diagnostics` now reports `toolAvailable`/`toolNote`
  (with the `NOT INSTALLED` marker the lsp hook understands) instead of
  presenting a missing compiler as "no diagnostics".
- daemon-bridge: the `STOP` command was never handled (the daemon kept
  running); SIGINT/SIGTERM now clean up socket/pid files; win32 `isRunning()`
  probed the pipe instead of returning `true`.
- session-tree: snapshots capture the full working tree (including untracked
  files) via a temporary index; the Stop hook creates auto-checkpoints only
  for sessions already using the tree.
- ulw-loop: removed a leftover `[debug-ground-truth]` stderr line.
- CI: dropped the dangling `evidence-attestation.test.ts` reference that broke
  `npm test`; the stale "ACCEPTS when all criteria pass" test now supplies a
  verifying evidence contract and a companion test pins the fail-closed
  behavior; the lsp bootstrap script honours package-metadata freshness.
- telemetry: single `lazyantigravity` product identity (the omo-codex
  dual-identity fallback is gone) and repository URLs point at this repo.

### Changed
- **Skill surface consolidated from 35 to 12** (+ 2 aliases): the 7 component-manual
  skills (comment-checker, lsp, rules, active-memory, adaptive-reasoning,
  active-learning, session-persistence) moved into their component READMEs — those
  behaviors run automatically via hooks and never needed a skill. Absorbed workflow
  skills (dual-verify, swarm-sync, flaky-guard, self-audit, hypothesis-tree,
  arch-guard, ultra-research, repo-survey, information-density, frontend-ui-ux,
  ui-loopback, ast-refactor, remove-ai-slops, vector-diagram) are preserved verbatim
  as `references/` inside the skill that owns their workflow. skills/ is now fully
  regenerated by sync-skills (stale entries are pruned instead of lingering).
- README, architecture/security doc, cheat sheet, and operations runbook now
  state what the implementation actually does (no unsubstantiated numbers;
  consensus fail-closed semantics documented; hook count corrected to
  25 command hooks across 7 events; skill count corrected to 35).
- `npm run check` = build + hook-policy check + root tests + all component
  suites.

## [0.6.0] - 2026-08-23

- 35 skills, 15 components, 3 bundled local MCP servers, 7 hook events /
  25 command hooks, evidence-bound ULW loop, opt-in telemetry.
