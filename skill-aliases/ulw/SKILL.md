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
2. Read `../ulw-loop/references/full-workflow.md` as the `ulw-loop` skill instructs.
3. Execute the full `ulw-loop` procedure. Do NOT stop at the alias — run the entire workflow.

## Antigravity Routing Semantics (inherited from ulw-loop)

- **Role routing**: Automatic. Work is decomposed into planner ➡️ researcher ➡️ worker ➡️ verifier ➡️ finalizer.
- **Model auto-routing**: NOT available on Antigravity. `canAutoRoute = false`.
- **Subagent model inheritance**: All subagents inherit the user's currently selected Antigravity model.
- **Subagent Control Plane Envelope**: When invoking subagents via `invoke_subagent`, you must construct and pass a role envelope with `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, and `requiresParentAck=true`. Do not claim the whole `/ulw` task is complete, and do not mark run as completed or failed.
- **Model recommendation**: Display once per session, then never repeat.
- **Resume Guidance**: If execution is interrupted due to quota limits, switch the model manually in the Antigravity UI dropdown and type `/ulw resume` to safely resume progress from where it was paused.

### Session-once model recommendation

At the start of this session, if this is the first `/ulw` or `/ulw-loop` invocation, output this message **exactly once**:

> 💡 **Antigravity Recommended Model Configuration Guide**
> - **Default / main coder**: Gemini 3.7 Flash (High)
> - **Rapid iterative bug fixes**: Gemini 3.7 Flash (Medium)
> - **Deep planning / complex design** (Claude quota available): Claude Opus 4.6 (Thinking)
> - **Cross-model verification**: Gemini 3.1 Pro (High)
> 
> *Note: Antigravity does not support automatic per-role model switching. All subagents (planner, researcher, worker, verifier) inherit the currently selected active model. Prefer Gemini 3.7 Flash (High) as the session default.*

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
