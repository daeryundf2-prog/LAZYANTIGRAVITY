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

- **Lane hints**: pass `invoke_subagent` `Subagents[].Model` (`canTierRoute=true`, `hostEnforced=false`) - `flash` for plan/code/research; verify lanes stay pro; only the single final-verdict lane uses inherit on a Claude session (Claude quota is scarce on Ultra) (`pro` for verify); `flash_lite` for tiny chores.
- **Session UI**: follow the user-selected session model (supported: Gemini 3.8 Flash (High), Claude Opus 5.5, Claude Sonnet 5.5). Antigravity does not rewrite the session UI model per role (`canAutoRoute=false`).
- **Subagent Control Plane Envelope**: When invoking subagents via `invoke_subagent`, pass `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, `requiresParentAck=true`.
- Use `invoke_subagent` only. Do **not** invent foreign spawn/wait APIs.
- **Resume Guidance**: If execution is interrupted due to quota limits, switch the model manually in the Antigravity UI dropdown and type `/ulw resume`.

### Session-once model recommendation

At the start of this session, if this is the first `/ulw` or `/ulw-loop` invocation, output this message **exactly once**:

<!-- MODEL-PROFILE:BEGIN ulw-guide -->
> **Antigravity Recommended Model Configuration Guide** (profile `gemini38-claude55`)
> - **Session default (plan + code + research)**: Gemini 3.8 Flash (High). Claude Opus/Sonnet 5.5 also work; follow the model the user picked.
> - **Bulk fan-out / researcher / worker**: `Model: "flash"`
> - **Verify / adversarial lanes**: `Model: "pro"` in any session
> - **Final verdict (one lane only)**: switch the UI to Claude, then pass `Model: "inherit"` to that single lane. Use it for a high-risk change, an ambiguous design, or debugging stuck after 2 rounds. Default Claude Sonnet 5.5 (High); Claude Opus 5.5 (High) for design calls.
> - **Rapid iterative bug fixes**: Flash (Medium) or `Model: "flash_lite"`
>
> *Google AI Ultra: Gemini quota is abundant, Claude quota is scarce. Spend Claude on verdicts, not fan-out.*
<!-- MODEL-PROFILE:END ulw-guide -->

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
