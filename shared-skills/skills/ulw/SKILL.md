---
name: ulw
description: Shorthand alias for /ulw-loop. Triggers the full ulw-loop workflow with role routing and model recommendation.
metadata:
  short-description: "/ulw shorthand — runs ulw-loop"
---

# /ulw — Shorthand for ulw-loop

This is a thin alias for the full `ulw-loop` skill. When the user types `/ulw <task>`, execute the complete `ulw-loop` workflow.

## Instructions

1. Read the `ulw-loop` skill by opening `../ulw-loop/SKILL.md` with `Read`. Follow all instructions there exactly.
2. Read `../ulw-loop/references/full-workflow.md` as the `ulw-loop` skill instructs (Antigravity-first Bootstrap).
3. Execute the full `ulw-loop` procedure. Do NOT stop at the alias — run the entire workflow.

## Antigravity Routing Semantics (inherited from ulw-loop)

- **Lane routing**: `invoke_subagent` with `model_tier` (`canTierRoute=true`) — `flash` for plan/code/research, `pro` for verify, `flash_lite` for tiny chores.
- **Session UI**: stay on Gemini 3.7 Flash (High). Antigravity does not rewrite the session UI model per role (`canAutoRoute=false`).
- **Subagent Control Plane Envelope**: When invoking subagents via `invoke_subagent`, pass `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, `requiresParentAck=true`.
- Use `invoke_subagent` only. Do **not** invent foreign spawn/wait APIs.
- **Resume Guidance**: If execution is interrupted due to quota limits, switch the model manually in the Antigravity UI dropdown and type `/ulw resume`.

### Session-once model recommendation

At the start of this session, if this is the first `/ulw` or `/ulw-loop` invocation, output this message **exactly once**:

> **Antigravity Recommended Model Configuration Guide**
> - **Session default (plan + code + research)**: Gemini 3.7 Flash (High) + `model_tier="flash"`
> - **Verify / adversarial lanes**: `model_tier="pro"`
> - **Rapid iterative bug fixes**: Gemini 3.7 Flash (Medium) or `model_tier="flash_lite"`
> - **Escape hatch only** (still ambiguous / high-stakes design after a Flash pass): Claude Opus 4.6 (Thinking) via manual UI switch
>
> *Antigravity routes lanes with model tiers. Prefer a Flash parent session for the whole run.*

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
