# Roadmap — Known Shortcomings & Next Fixes

## Real-session validation log (Antigravity + Gemini 3.7 Flash, production repo)

| Date | Feature | Result |
| :--- | :--- | :--- |
| 08-29 | quick-lane (light query bypasses orchestration) | PASS — direct repo answer |
| 08-29 | /ulw evidence loop, single goal | PASS — checkpoint complete with verifying evidence contract |
| 08-29 | memory remember/search across sessions | PASS |
| 08-29 | session-tree snapshot via skill wiring | PASS — nodes.json gained a real node (the bypass fix works) |
| 08-29 | **session-tree fork rollback** | PASS — unsafe implementation written, fork restored the working tree, removal proven on disk |
| 08-29 | **consensus host transport, end-to-end** | PASS — checkpoint failed closed into needs_user_decision → consensus-pending (4 personas) → invoke_subagent(Model: pro) × 4 → report-consensus-result × 4 → aggregate-consensus = consensus_passed → checkpoint complete. All four adversarial personas approved a timing-safe token implementation |
| 08-30 | ledger lock on Windows (EPERM/EACCES retry) | fixed live by the owner's session; O(1) ledger cache landed too |
| 08-30 | **orchestration layer, 8 phases** | PASS — multi-goal isolation (no over-completion), context-loss recovery without replanning, resume, steering (steering_accepted/criteria_revised events), full 7-step subagent envelope with SHA-256 chaining, check-leases, blackboard TTL/namespace/cross-process handoff, stagnation guard (3-strike same_error_loop → pause_or_replan), destructive rewind with backup, self-audit. One real defect found and fixed: cheat sheet advertised a nonexistent self-audit path (actual: scripts/self-audit.mjs) |
| 08-30 | orchestration layer, independent re-run (fresh /tmp) | PASS — 16 items reproduced identically. Notable confirmations: stagnation event carries severity high + mustNotAutoFailRun (guard notifies, never auto-fails); rewind truncates 10→3 events with a full backup file; role checkpoints persist resumeCommand; goal IDs are content-derived slugs |

### Acceptance suite (2026-08-30): 16/16 PASS, isolated /tmp execution

| 08-30 | **media-mcp (5th server)** | PASS — probe/frames/ocr live (ffmpeg+tesseract), transcribe degrades honestly without whisper, youtube gated behind LAZYANTIGRAVITY_MEDIA_NETWORK=1, path confinement + URL allowlist enforced |
| 08-30 | media acceptance run #1 | BLOCKED — the installed plugin clone was stale (pre-media) with an unpushed local session commit; the session correctly reported the media server as absent and worked around it with raw ffmpeg/Pillow/vision. Install clone rebased onto main (the local LOC-streamline commit was dropped as superseded — main already fixed the ceiling via security.ts/state-mutations.ts extraction); probe now shows 5 servers in the install. Re-run pending after Antigravity restart |

All 0.7.0 features verified live in one session: MCP probe (4 servers,
tool counts), blackboard fail-open hint + daemon round-trip, MCP
session_tree_snapshot, fork working-tree restore, prune --keep 2
(7→2 refs), the full git-bash policy matrix (destructive/network
denials, binary allowlist, path confinement, metachar rejection,
GIT_WRITE opt-in), ast-grep fallback + dryRun semantics + absolute-path
rejection, active-learning record→cluster(95%)→evolve rejection
messages, daemon background lifecycle with cleanup, and the ULW CLI
prefix hint. No failures. (Report note: the 4th lsp tool is
`lsp_symbols`, not "hover" — paraphrase in the agent's report.)

Expected behavior worth noting: memory_search returned 0 facts in the
isolated /tmp workspace — memory is workspace-scoped by design; the
session facts from the real repo live in that repo's
`.lazyantigravity/memory/facts.jsonl`.


Open items carried forward from user-journey simulation (2026-08-29) and code
review. Ordered by user impact. Each item states the evidence, the suggested
fix, and what "done" means. Pick one, fix it, run `npm run check`, and check it
off.

## External review pass — 2026-08-30 ✅ (partial)

An external review (scores: code 8, architecture 8, tests 8.5, docs 8.5,
security 7.5) confirmed four findings and produced the following repairs:

- ✅ **Windows named-pipe name collision** — the pipe name was derived from the
  first 8 bytes of cwd, so every project under `C:\Users\` shared one pipe and
  the daemon silently attached to the wrong workspace. Now derived from
  `sha256(resolve(cwd))`, and `start()` probes the pipe before listening on
  win32 (stale-pid reuse can no longer wedge startup).
- ✅ **verify:reproducible scope** — the check now includes the four bundled
  MCP `dist/` trees and catches untracked dist files (`git diff HEAD` +
  `ls-files --others`); the README/CONTRIBUTING "100%" claim is now true.
- ✅ **Windows exe planting** — `git-bash-mcp` and `lsp-tools-mcp` now resolve
  `git`/`npx`/`python3`/`go` from PATH only (never cwd) and launch `npx` via
  `node <npm>/bin/npx-cli.js` so the LSP gate works on Windows again.
- ✅ **Daemon client misreporting** — `status()` now returns `null` for error
  responses instead of a truthy error object ("IPC daemon alive" lies);
  nonce ledger is pruned; oversized unterminated IPC lines drop the socket;
  destructive `rewindLedger` runs under the ledger write lock; corrupted
  ledger lines are reported on stderr instead of skipped silently; the
  write-lock is released before the fd close to avoid a TOCTOU window.
- ✅ **Windows test drift** — `rules` (JSON-escaped path assertions,
  symlink-privilege skip), `start-work-continuation` (win32 `resolve()` drive
  letter vs fixture keys), and `lsp` (vitest/.cmd EINVAL spawn, fake npm
  shim) — `test:components` is now 15/15 on Windows.

New items opened by the review:

### 9. Execution binding is self-reported
- **Evidence**: `evidence-completion-gate.ts` validates the structure and
  `exitCode === 0` of a binding the *agent* produced; there is no host-side
  registry to compare against. Only `fileChecksums`/`readRanges` are verified
  against the real disk.
- **Fix**: have the hook runner issue a signed audit record per command it
  executes and require the gate to reference a record it did not author.
- **Done when**: a forged `commandAudits` entry fails the gate in a test.

### 10. Windows token ACL
- **Evidence**: `chmodSync(0o600)` on the daemon token is a no-op on win32;
  any local process that reads the workspace can use the token. The pipe's
  default DACL is Everyone-readable.
- **Fix**: restrict the pipe DACL to the user SID and apply an icacls grant to
  the token file on win32.
- **Done when**: a second low-privilege process cannot read the token.

### 11. ✅ DONE (2026-08-30) — appendRunEvent was O(n^2)
- **Evidence**: every append re-read the whole events.jsonl AND replayed the
  full state three times (readRunEvents + reconstructAndSaveState +
  getAgentState), and the control-plane mirror rewrote its whole wal-index.json
  per append. Cost grew 13 -> 61 ms/append between 100 and 1200 events.
- **Resolution**: per-run append cache (last event + reconstructed state,
  validated by ledger file size so any foreign append/rewind/repair falls back
  to a full reconstruction), single-event incremental state application
  (`applyEventToState`), and the mirror converted to an append-only JSONL with
  legacy `wal-index.json` migration. Extracted into `src/append-run-event.ts`
  to stay under the 250-LOC ceiling.
- **Measured**: `node scripts/bench-ledger-append.mjs` — 9.85 / 8.98 / 8.84 /
  8.56 ms per append at 100 / 400 / 800 / 1200 events (flat, -13% drift);
  burst test 3.5 s -> 2.2 s for 160 events. Coherence tests pin that the
  cached state equals a full replay and that a foreign append (cache bypass)
  re-chains correctly.

### 12. Read paths still write (migration + plan migration append)
- **Evidence**: `readUlwLoopPlan` performs migration writes and ledger
  appends. Read-only callers (doctor, status) mutate the run directory.
- **Fix**: gate migration writes behind an explicit `--migrate` path.
- **Done when**: doctor/status leave `.lazycodex/runs` untouched.

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

### 5. ✅ DONE — Windows proven and blocking
- **Evidence**: named-pipe IPC, win32 hooks, and path handling exist; the CI
  `windows-probe` job is `continue-on-error`. First probe run (2026-08-29)
  failed on two unix-only test assumptions — now fixed: the ast-grep engine
  tests are environment-aware (optional `@ast-grep/napi` may be absent), and
  the hook-runner feedback test is unix-gated (fake npm PATH trick). Second
  run exposed two more: `node --test` on node 20 does not glob
  `scripts/*.test.mjs` (lsp test script enumerates explicitly now), and the
  skill drift comparison must EOL-normalize (Windows checkouts carry CRLF).
- **Fix**: let the probe run, fix what fails, then remove `continue-on-error`
  to make it blocking.
- **Resolution**: after the npm shell-gating fix plus the owner's session
  commits (named-pipe dedupe, spawn hardening, EPERM retry), the
  `windows-probe` job passed on 2026-08-29 and is now a blocking CI job
  (`continue-on-error` removed). Follow-up idea kept open: a CI step
  installing `@ast-grep/napi` into ast-grep-mcp so the structural-engine
  path is exercised on CI too.

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
