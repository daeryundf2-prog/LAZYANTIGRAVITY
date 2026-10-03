---
name: ulw-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

# ulw-loop

Use this skill when the user asks for `ulw-loop`, `ulw`, durable goal execution, evidence-led work, manual QA, or checkpointed long-running delivery.

This skill is intentionally compact. The full workflow lives in `references/full-workflow.md`. Read only the sections needed for the current phase, then execute them exactly.

**Default host for LazyAntigravity:** Google Antigravity + Gemini 3.8 Flash (High).

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read **Runtime selection**, **Bootstrap**, **Execution Loop**, and **Manual-QA channels** before running any ULW command or recording evidence.
3. Resolve the ULW CLI via Bootstrap (PLUGIN_ROOT / Windows PowerShell / `~/.gemini/config/plugins/lazyantigravity/.../cli.js`). If CLI is missing, stop and report — do not hand-edit goal JSON.
4. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rules. Tests alone never prove done.
5. If the work mutates the workspace, take a baseline snapshot BEFORE edits: prefer the `session_tree_snapshot` MCP tool (workspace server) when available, otherwise run `node "$PLUGIN_ROOT/components/session-tree/dist/cli.js" snapshot "<label>"`. Verify `.lazyantigravity/session-tree/nodes.json` gained a node — a JSON note written anywhere else is NOT a snapshot and satisfies no criterion.

## Non-Negotiables

- Use the ulw-loop CLI state under `.omo/ulw-loop`; do not hand-edit goal state.
- After any compaction or context loss, re-read brief + goals + ledger FIRST (read files directly) plus `lazyantigravity ulw-loop status --json`, then resume; never re-plan from scratch.
- Every success criterion needs observable evidence from a real channel: tmux, HTTP, browser, or computer-use.
- Record evidence through the CLI only after cleanup receipts are available.
- Delegate via `invoke_subagent` only (see `../references/antigravity-tools.md`).
- When invoking a subagent, pass a role envelope:
  - `mayFinalizeRun=false`
  - `mayModifyGlobalRunState=false`
  - `mustReturn=SubagentResultEnvelope`
  - `requiresParentAck=true`
  - Do not claim the whole /ulw task is complete.
  - Do not mark run as completed or failed.
- **Pass `Subagents[].Model`** on `invoke_subagent` (`canTierRoute=true`, `hostEnforced=false`):
  - plan / research / implement / explore → `Model: "flash"`
  - verify / adversarial review → `Model: "inherit"` (when session is Claude 5.5, child stays on Claude) / `Model: "pro"` (when session is Gemini)
  - tiny repetitive chores → `Model: "flash_lite"`
  - inherit parent → `Model: "inherit"`
- Follow the user-selected **session model** (supported: Gemini 3.8 Flash (High), Claude Opus 5.5, Claude Sonnet 5.5). Prefer tier routing over switching the whole session UI. Manual UI switch to Gemini 3.1 Pro or Claude Opus 5.5 is optional when you want the parent itself on Pro/Opus.
- Use `git-master` for git-tracked edits: inspect recent and touched-path commit history, then commit each verified work unit atomically.

## Antigravity Tool Mapping

| Workflow intent | Antigravity action |
| --- | --- |
| Plan / research / implement / QA | `invoke_subagent` with role envelope + TASK/DELIVERABLE/SCOPE/VERIFY |
| ULW state / evidence / checkpoint | `lazyantigravity ulw-loop …` after Bootstrap resolves CLI to `node …/ulw-loop/dist/cli.js` |
| Model routing | Session UI = follow session model; lane tier = `flash` / `pro` / `flash_lite` / `inherit` |

Session-once model recommendation (first `/ulw` or `/ulw-loop` only):

> **Antigravity Recommended Model Configuration Guide**
> - **Session options (plan + code + research)**: Gemini 3.8 Flash (High), Claude Opus 5.5 (High), Claude Sonnet 5.5 (High)
> - **Verify / adversarial lanes**: `invoke_subagent` with `Model: "inherit"` (when session is Claude 5.5) / `Model: "pro"` (when session is Gemini)
> - **Rapid iterative bug fixes**: Flash (Medium) or `Model: "flash_lite"`
> - **Escape hatch only** (still ambiguous / high-stakes design): Claude Opus 5.5 (High) via manual UI switch (only needed when the session is Gemini)
>
> *Pass `Subagents[].Model` on `invoke_subagent`. The host does not rewrite the session UI model (`canAutoRoute=false`, `hostEnforced=false`).*

Suppress if the user says "quiet run", "skip model recommendation", "no model hint", or "quiet".

## Token & Quota Safety and Safe-Resume Design

### 1. Limit / Error Classification
- `context_window_exceeded`, `output_token_limit`, `model_rate_limited`, `account_quota_exceeded`, `provider_unavailable`, `unknown_model_error`

### 2. Checkpoint Storage
`lazyantigravity ulw-loop save-role-checkpoint ...`  
Saved in: `.omo/ulw-loop/checkpoints/ulw-{timestamp}.json` (legacy `.lazycodex/checkpoints/` still readable).

### 3. Antigravity Safety Flow
If rate limit/quota is detected:
- Stop immediately; save checkpoint; recommend fallback models (3.7 High → 3.7 Medium → 3.1 Pro → Opus 5.5 escape hatch → Sonnet 5.5); user switches UI model; `/ulw resume`.

Fallback sequence (exact):
- **When Gemini 3.8 Flash (High) is limited**: 3.7 Flash → Medium → 3.1 Pro → Opus 5.5 → Sonnet 5.5
- **When Gemini 3.8 Flash (Medium) is limited**: High → 3.7 Flash → 3.1 Pro → Sonnet 5.5
- **When Gemini 3.1 Pro (High) is limited**: 3.7 High → 3.7 Medium → Opus 5.5
- **When Claude Opus 5.5 is limited**: Gemini 3.8 Flash → 3.7 High → 3.7 Medium → 3.1 Pro → Sonnet 5.5
- **When Claude Sonnet 5.5 is limited**: Gemini 3.8 Flash → 3.7 High → 3.7 Medium → 3.1 Pro
- **When all exhausted**: wait for refresh or suggest enabling AI Credit Overages manually

### 4. Compact Mode
Use a 1M context model (e.g. Gemini 3.8 Flash (High)) if large window is needed. Summarize logs; slice files; compress outputs; save artifacts to disk.

### 5. Batch Mode
Split patches; verify each batch; checkpoint often.

### 6. Resume (`/ulw resume`)
Load latest checkpoint; show completed/failed roles and next action. Does **not** auto-spawn workers or auto-switch the session UI model.

### 7. AI Credit Overages
Never auto-enable. Inform the user only.

## References

- [dual-verify](references/dual-verify.md) — consensus gate incl. the host-subagent transport
- [swarm-sync](references/swarm-sync.md) — worktree isolation for parallel workers
- [flaky-guard](references/flaky-guard.md) — flaky test stress-running
- [self-audit](references/self-audit.md) — trajectory audit and rollback
