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
Codex-only tool names live in `references/codex.md` — do not use them on Antigravity.

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read **Runtime selection**, **Bootstrap**, **Execution Loop**, and **Manual-QA channels** before running any ULW command or recording evidence.
3. Resolve the ULW CLI via Bootstrap (PLUGIN_ROOT / Windows PowerShell / `~/.gemini/config/plugins/lazyantigravity/.../cli.js`). If CLI is missing, stop and report — do not hand-edit goal JSON.
4. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rules. Tests alone never prove done.

## Non-Negotiables

- Use the ulw-loop CLI state under `.omo/ulw-loop`; do not hand-edit goal state.
- After any compaction or context loss, re-read brief + goals + ledger FIRST (read files directly) plus `omo ulw-loop status --json`, then resume; never re-plan from scratch.
- Every success criterion needs observable evidence from a real channel: tmux, HTTP, browser, or computer-use.
- Record evidence through the CLI only after cleanup receipts are available.
- On Antigravity, delegate via `invoke_subagent` (never `spawn_agent` / `wait_agent`).
- When invoking a subagent, pass a role envelope:
  - `mayFinalizeRun=false`
  - `mayModifyGlobalRunState=false`
  - `mustReturn=SubagentResultEnvelope`
  - `requiresParentAck=true`
  - Do not claim the whole /ulw task is complete.
  - Do not mark run as completed or failed.
- Optional `Model` tier on `invoke_subagent`: `pro` | `flash` | `flash_lite` | `inherit`. This is a **manual hint only** — Antigravity does not auto-route catalog roles (`canAutoRoute=false`).
- Use `git-master` for git-tracked edits: inspect recent and touched-path commit history, then commit each verified work unit atomically.

## Antigravity Tool Mapping

| Workflow intent | Antigravity action |
| --- | --- |
| Plan / research / implement / QA | `invoke_subagent` with role envelope + TASK/DELIVERABLE/SCOPE/VERIFY |
| ULW state / evidence / checkpoint | `omo ulw-loop …` after Bootstrap resolves CLI to `node …/ulw-loop/dist/cli.js` |
| Model choice | User UI dropdown (default: Gemini 3.7 Flash High); optional Model tier hint on subagent |

Session-once model recommendation (first `/ulw` or `/ulw-loop` only):

> 💡 **Antigravity Recommended Model Configuration Guide**
> - **Session default (plan + code + research)**: Gemini 3.7 Flash (High)
> - **Rapid iterative bug fixes**: Gemini 3.7 Flash (Medium)
> - **Cross-model verification**: Gemini 3.1 Pro (High)
> - **Escape hatch only** (still ambiguous / high-stakes design after a Flash pass): Claude Opus 4.6 (Thinking)
>
> *Note: Antigravity does not support automatic per-role model switching. Prefer Gemini 3.7 Flash (High) for the whole session unless you intentionally switch for verify or an escape-hatch redesign.*

Suppress if the user says "quiet run", "skip model recommendation", "no model hint", or "quiet".

What NOT to say: auto model routing enabled; switching to Opus automatically; verifier will use Gemini without a UI switch.

## Codex Tool Mapping

See `references/codex.md`.

## Token & Quota Safety and Safe-Resume Design

### 1. Limit / Error Classification
- `context_window_exceeded`, `output_token_limit`, `model_rate_limited`, `account_quota_exceeded`, `provider_unavailable`, `unknown_model_error`

### 2. Checkpoint Storage
`omo ulw-loop save-role-checkpoint ...`  
Saved in: `.omo/ulw-loop/checkpoints/ulw-{timestamp}.json` (legacy `.lazycodex/checkpoints/` still readable).

### 3. Antigravity Safety Flow (No Auto-Switching)
If rate limit/quota is detected:
- Stop immediately; save checkpoint; recommend fallback models (3.7 Medium → 3.1 Pro → Opus escape hatch → Sonnet); user switches UI model; `/ulw resume`.

Fallback sequence (exact):
- **When Gemini 3.7 Flash (High) is limited**: Medium → 3.1 Pro → Opus → Sonnet
- **When Gemini 3.7 Flash (Medium) is limited**: High → 3.1 Pro → Sonnet
- **When Gemini 3.1 Pro (High) is limited**: 3.7 High → 3.7 Medium → Opus
- **When Claude Opus is limited** (escape hatch only): 3.7 High → 3.7 Medium → 3.1 Pro
- **When Claude Sonnet is limited**: 3.7 High → 3.7 Medium → 3.1 Pro
- **When all exhausted**: wait for refresh or suggest enabling AI Credit Overages manually

### 4. Codex Safety Flow
See `references/codex.md` (catalog `fallbackChain`).

### 5. Compact Mode
Switch UI to Gemini 3.7 Flash (High) for ~1M context (about 3.5x larger than typical GPT-5.5/Claude windows). Summarize logs; slice files; compress outputs; save artifacts to disk.

### 6. Batch Mode
Split patches; verify each batch; checkpoint often.

### 7. Resume (`/ulw resume`)
Load latest checkpoint; show completed/failed roles and next action. Does **not** auto-spawn workers or auto-switch models on Antigravity.

### 8. AI Credit Overages
Never auto-enable. Inform the user only.

## Codex Harness Compatibility (aggregated test contract)

This section preserves the Codex orchestration contract so aggregated `node --test` suites remain green while Antigravity remains the default host. On Antigravity, prefer `invoke_subagent`; the strings below document the Codex fallback.

- TASK: example subagent invocation uses `fork_turns="none"` and `fork_turns: "none"` to avoid full-history forks.
- Codex subagent liveness: `wait_agent` mailbox signals — short `wait_agent` cycles, a single long blocking wait is forbidden; a `wait_agent` timeout only means no new mailbox update arrived.
- Progress contract: child sends `WORKING: <task> - <phase>` while running and `BLOCKED: <reason>` only when stuck.
- Polling guard: single `list_agents` check after a `wait_agent` timeout; Do not use `list_agents` as a polling loop.
- Recovery: Fallback only when the child completed without deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running; respawn with smaller scope and `model` `reasoning_effort` default agent.
- Long runners: Plan and reviewer agents may run for a long time; keep short `wait_agent` cycles and avoid a single long blocking wait.
- Test contract strings: short wait_agent cycles, single long blocking wait, respawn with smaller scope, model reasoning_effort default agent
- A timeout only means no new mailbox update arrived
- wait_agent mailbox signals
- short wait_agent cycles
- single long blocking wait
- single `list_agents`
- Do not use `list_agents` as a polling loop
- Fallback only when
- respawn with smaller
- TASK: and WORKING: and BLOCKED:
- Liveness: active subagent count and latest `WORKING:` phase
