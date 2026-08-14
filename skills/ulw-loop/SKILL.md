---
name: ulw-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

# ulw-loop

Use this skill when the user asks for `ulw-loop`, `ulw`, durable goal execution, evidence-led work, manual QA, or checkpointed long-running delivery.

This skill is intentionally compact. The full workflow lives in `references/full-workflow.md`. Read only the sections needed for the current phase, then execute them exactly.

**Default host for LazyAntigravity:** Google Antigravity + Gemini 3.7 Flash (High).

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read **Runtime selection**, **Bootstrap**, **Execution Loop**, and **Manual-QA channels** before running any ULW command or recording evidence.
3. Resolve the ULW CLI via Bootstrap (PLUGIN_ROOT / Windows PowerShell / `~/.gemini/config/plugins/lazyantigravity/.../cli.js`). If CLI is missing, stop and report — do not hand-edit goal JSON.
4. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rules. Tests alone never prove done.

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
  - verify / adversarial review → `Model: "pro"`
  - tiny repetitive chores → `Model: "flash_lite"`
  - inherit parent → `Model: "inherit"`
- Session UI stays on **Gemini 3.7 Flash (High)** for the parent. Prefer tier routing over switching the whole session UI. Manual UI switch to Gemini 3.1 Pro is optional when you want the parent itself on Pro.
- Use `git-master` for git-tracked edits: inspect recent and touched-path commit history, then commit each verified work unit atomically.

## Antigravity Tool Mapping

| Workflow intent | Antigravity action |
| --- | --- |
| Plan / research / implement / QA | `invoke_subagent` with role envelope + TASK/DELIVERABLE/SCOPE/VERIFY |
| ULW state / evidence / checkpoint | `lazyantigravity ulw-loop …` after Bootstrap resolves CLI to `node …/ulw-loop/dist/cli.js` |
| Model routing | Session UI = Gemini 3.7 Flash (High); lane tier = `flash` / `pro` / `flash_lite` / `inherit` |

Session-once model recommendation (first `/ulw` or `/ulw-loop` only):

> **Antigravity Recommended Model Configuration Guide**
> - **Session default (plan + code + research)**: Gemini 3.7 Flash (High)
> - **Verify / adversarial lanes**: `invoke_subagent` with `Model: "pro"` (Gemini 3.1 Pro family hint)
> - **Rapid iterative bug fixes**: Gemini 3.7 Flash (Medium) or `Model: "flash_lite"`
> - **Escape hatch only** (still ambiguous / high-stakes design after a Flash pass): Claude Opus 4.6 (Thinking) via manual UI switch
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
- Stop immediately; save checkpoint; recommend fallback models (3.7 Medium → 3.1 Pro → Opus escape hatch → Sonnet); user switches UI model; `/ulw resume`.

Fallback sequence (exact):
- **When Gemini 3.7 Flash (High) is limited**: Medium → 3.1 Pro → Opus → Sonnet
- **When Gemini 3.7 Flash (Medium) is limited**: High → 3.1 Pro → Sonnet
- **When Gemini 3.1 Pro (High) is limited**: 3.7 High → 3.7 Medium → Opus
- **When Claude Opus is limited** (escape hatch only): 3.7 High → 3.7 Medium → 3.1 Pro
- **When Claude Sonnet is limited**: 3.7 High → 3.7 Medium → 3.1 Pro
- **When all exhausted**: wait for refresh or suggest enabling AI Credit Overages manually

### 4. Compact Mode
Switch UI to Gemini 3.7 Flash (High) for ~1M context (about 3.5x larger than typical GPT-5.5/Claude windows). Summarize logs; slice files; compress outputs; save artifacts to disk.

### 5. Batch Mode
Split patches; verify each batch; checkpoint often.

### 6. Resume (`/ulw resume`)
Load latest checkpoint; show completed/failed roles and next action. Does **not** auto-spawn workers or auto-switch the session UI model.

### 7. AI Credit Overages
Never auto-enable. Inform the user only.
