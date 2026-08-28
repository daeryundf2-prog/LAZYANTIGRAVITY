# Roadmap — Known Shortcomings & Next Fixes

Open items carried forward from user-journey simulation (2026-08-29) and code
review. Ordered by user impact. Each item states the evidence, the suggested
fix, and what "done" means. Pick one, fix it, run `npm run check`, and check it
off.

## P1 — User-facing, small

### 1. ULW CLI: unknown commands should hint at the `ulw-loop` prefix
- **Evidence**: `node components/ulw-loop/dist/cli.js create-goals` prints
  `unknown command: create-goals` followed by usage that does not make the
  required `ulw-loop <subcommand>` prefix obvious. First-time callers (human or
  agent) reliably hit this.
- **Fix**: in the CLI's unknown-command path, if the unknown token matches a
  known subcommand name, print
  `Unknown command '<x>'. Subcommands are namespaced: ulw-loop <subcommand>. Run 'ulw-loop help'.`
- **Done when**: the bare-call simulation prints the hint; a regression test
  asserts it.

### 2. quick-lane did not fire with simulated host stdin
- **Evidence**: in the user-journey simulation the quick-lane hook returned
  empty output for `이 함수 어디에 정의되어 있어?` even though the classifier
  unit test asserts it is a quick-lane prompt. `isQuickLaneHookInput` likely
  requires host stdin fields the simulation omitted.
- **Fix**: pin down the required stdin shape (add an e2e test using the exact
  field set Antigravity sends for UserPromptSubmit), then verify on a real
  Antigravity session.
- **Done when**: a test reproduces the injection with host-shaped input, and a
  real-session confirmation is recorded here.

## P2 — Correctness & robustness

### 3. Ledger writes are not atomic
- **Evidence**: `components/ulw-loop/src/control-plane-sqlite.ts` rewrites the
  whole JSON ledger with `writeFileSync` on every append (no temp+rename); a
  crash mid-write corrupts the flagship state store. The active-learning
  events rotation (`components/active-learning/src/recorder.ts`) rewrites in
  place too.
- **Fix**: write to `<file>.tmp` and `renameSync` over the target; apply to
  both sites.
- **Done when**: both writers use temp+rename and a test asserts the temp file
  never contains partial content after a simulated failure.

### 4. MCP servers trust `cwd` blindly
- **Evidence**: all four bundled servers treat `process.cwd()` (or
  `LAZYANTIGRAVITY_WORKSPACE_ROOT`) as the workspace. If the host launches them
  from the plugin directory, memory/session-tree/git-bash silently operate on
  the plugin tree instead of the user's project.
- **Fix**: on startup, warn (stderr) when cwd looks like the plugin root;
  document how the host should set `cwd`/env; verify against real Antigravity
  launches.
- **Done when**: the guard exists with a test, and a real-launch confirmation
  is recorded.

### 5. Windows is implemented but unproven
- **Evidence**: named-pipe IPC, win32 hooks, and path handling exist; the CI
  `windows-probe` job is `continue-on-error` because its result is unknown.
- **Fix**: let the probe run, fix what fails, then remove `continue-on-error`
  to make it blocking.
- **Done when**: `windows-probe` has no `continue-on-error` and passes.

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
