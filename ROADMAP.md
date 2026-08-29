# Roadmap — Known Shortcomings & Next Fixes

Open items carried forward from user-journey simulation (2026-08-29) and code
review. Ordered by user impact. Each item states the evidence, the suggested
fix, and what "done" means. Pick one, fix it, run `npm run check`, and check it
off.

## P1 — User-facing, small

### 1. ✅ DONE (this pass) — ULW CLI: unknown commands hint at the `ulw-loop` prefix
- **Evidence**: `node components/ulw-loop/dist/cli.js create-goals` prints
  `unknown command: create-goals` followed by usage that does not make the
  required `ulw-loop <subcommand>` prefix obvious. First-time callers (human or
  agent) reliably hit this.
- **Fix**: in the CLI's unknown-command path, if the unknown token matches a
  known subcommand name, print
  `Unknown command '<x>'. Subcommands are namespaced: ulw-loop <subcommand>. Run 'ulw-loop help'.`
- **Done when**: the bare-call simulation prints the hint; a regression test
  asserts it.

### 2. ✅ RESOLVED — quick-lane: simulation artifact, hook verified
- **Root cause**: the simulation omitted `hook_event_name: "UserPromptSubmit"`,
  which `isQuickLaneHookInput` requires. The hook was correct all along.
- **Resolution**: unit tests now pin the host-shaped input (injection fires)
  and the negative cases. A real-session confirmation remains nice-to-have.

## P2 — Correctness & robustness

### 3. ✅ DONE (this pass) — Ledger writes are atomic
- **Evidence**: `components/ulw-loop/src/control-plane-sqlite.ts` rewrites the
  whole JSON ledger with `writeFileSync` on every append (no temp+rename); a
  crash mid-write corrupts the flagship state store. The active-learning
  events rotation (`components/active-learning/src/recorder.ts`) rewrites in
  place too.
- **Resolution**: both writers now use `<file>.tmp` + `renameSync`; the ledger
  and active-learning suites pass unchanged.

### 4. ✅ DONE (this pass) — MCP workspace-root guard
- **Evidence**: all four bundled servers treat `process.cwd()` (or
  `LAZYANTIGRAVITY_WORKSPACE_ROOT`) as the workspace. If the host launches them
  from the plugin directory, memory/session-tree/git-bash silently operate on
  the plugin tree instead of the user's project.
- **Resolution**: all four servers warn on stderr when cwd is inside
  `PLUGIN_ROOT`; covered by `test/mcp-workspace-guard.test.mjs`. A real-launch
  confirmation against Antigravity remains open.

### 5. Windows is implemented but unproven
- **Evidence**: named-pipe IPC, win32 hooks, and path handling exist; the CI
  `windows-probe` job is `continue-on-error`. First probe run (2026-08-29)
  failed on two unix-only test assumptions — now fixed: the ast-grep engine
  tests are environment-aware (optional `@ast-grep/napi` may be absent), and
  the hook-runner feedback test is unix-gated (fake npm PATH trick).
- **Fix**: let the probe run, fix what fails, then remove `continue-on-error`
  to make it blocking.
- **Done when**: `windows-probe` has no `continue-on-error` and passes.
- **Follow-up**: consider a CI step installing `@ast-grep/napi` into
  ast-grep-mcp so the structural-engine path is exercised on CI too.

### 6. Hook fan-out costs 5 node spawns per prompt
- **Evidence**: hooks.json runs 5 command hooks on SessionStart,
  UserPromptSubmit and Stop (3 on PostToolUse); each pays a node spawn
  (~50-70ms on Apple Silicon, worse on Windows).
- **Fix**: a single dispatcher per event that runs the individual hook
  handlers in one process, preserving order, dedup and FAIL_OPEN/FAIL_CLOSED
  policies (`verify:hook-policies` must be extended to the dispatcher).
- **Done when**: one spawn per event, `npm run bench` shows the improvement,
  and policies still verify.

## P3 — Polish

### 7. Codex compatibility boilerplate duplicated across skills
- **Evidence**: every SKILL.md carries the same "Codex Harness Tool
  Compatibility" block; tests strip it before comparing, so it is known
  boilerplate (~14 copies).
- **Fix**: move it to one shared reference and inject it at packaging time, or
  accept the duplication and document why.
- **Done when**: a single source of truth exists or the decision is recorded.

### 8. Skill markdown volume
- **Evidence**: the consolidation (0.7.0) cut the skill surface 35 → 12 + 2
  aliases but total markdown lines stayed ~26.5k because content was preserved
  into references.
- **Fix**: prune overlapping reference content where it genuinely duplicates
  component READMEs; keep one canonical copy per topic.
- **Done when**: references contain no full-text duplicates of component
  READMEs.
