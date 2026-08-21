---
name: ulw
description: Shorthand alias for /ulw-loop. Triggers the full ulw-loop workflow with role routing and model recommendation.
metadata:
  short-description: "/ulw shorthand — runs ulw-loop"
---

# /ulw — Shorthand for ulw-loop

This is a thin alias for the full `ulw-loop` skill. When the user types `/ulw <task>`, execute the complete `ulw-loop` workflow.

## Instructions

1. Read the `ulw-loop` skill by opening `../ulw-loop/SKILL.md` with `view_file`. Follow all instructions there exactly.
2. Read `../ulw-loop/references/full-workflow.md` as the `ulw-loop` skill instructs (Antigravity-first Bootstrap).
3. Execute the full `ulw-loop` procedure. Do NOT stop at the alias — run the entire workflow.

## Antigravity Routing Semantics (inherited from ulw-loop)

- **Role routing**: Automatic. Work is decomposed into planner → researcher → worker → verifier → finalizer.
- **Model auto-routing**: NOT available on Antigravity. `canAutoRoute = false`. Routing mode is hint-only.
- **Subagent model inheritance**: All subagents inherit the user's currently selected Antigravity model unless you pass an optional Model tier (`pro` | `flash` | `flash_lite` | `inherit`).
- **Subagent Control Plane Envelope**: When invoking subagents via `invoke_subagent`, pass `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, `requiresParentAck=true`.
- **Do not use** Codex tools (`spawn_agent`, `wait_agent`, `list_agents`, `close_agent`) on Antigravity.
- **Resume Guidance**: If execution is interrupted due to quota limits, switch the model manually in the Antigravity UI dropdown and type `/ulw resume`.

### Session-once model recommendation

At the start of this session, if this is the first `/ulw` or `/ulw-loop` invocation, output this message **exactly once**:

> 💡 **Antigravity Recommended Model Configuration Guide**
> - **Session default (plan + code + research)**: Gemini 3.7 Flash (High)
> - **Rapid iterative bug fixes**: Gemini 3.7 Flash (Medium)
> - **Cross-model verification**: Gemini 3.1 Pro (High)
> - **Escape hatch only** (still ambiguous / high-stakes design after a Flash pass): Claude Opus 4.6 (Thinking)
> 
> *Note: Antigravity does not support automatic per-role model switching. All subagents inherit the selected model. Prefer Gemini 3.7 Flash (High) for the whole session unless you intentionally switch for verify or an escape-hatch redesign.*

**Suppression**: If the user's message contains "quiet run", "skip model recommendation", "no model hint", or "quiet", skip this recommendation and proceed directly.

**Do not repeat**: If the recommendation was already shown in this conversation (by either `/ulw` or `/ulw-loop`), do not show it again.

### What NOT to say
- ~~auto model routing enabled~~
- ~~switching to Opus~~
- ~~verifier will use Gemini~~
- ~~researcher will use Flash~~

Use instead:
- "role routing enabled"
- "model recommendation only — subagents inherit the selected Antigravity model"

## After reading this file

Immediately proceed to read and execute the `ulw-loop` skill. This alias adds no additional steps beyond the model recommendation above.

## Codex Compatibility (test contract)

- TASK: delegates via `spawn_agent(agent_type="worker", fork_turns="none")` on Codex; `wait_agent` mailbox signals, short `wait_agent` cycles, a `wait_agent` timeout only means no new mailbox update arrived.
- Progress: `WORKING: <task> - <phase>` and `BLOCKED: <reason>` contract, single `list_agents` check after timeout; Do not use `list_agents` as a polling loop; Fallback only when child completed without deliverable.
- Model: `model` `reasoning_effort` default agent; Plan and reviewer agents may run for a long time; avoid a single long blocking wait.
- Liveness: active subagent count and latest `WORKING:` phase
