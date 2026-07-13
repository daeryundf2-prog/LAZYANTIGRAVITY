---
name: ulw
description: Shorthand alias for /ulw-loop. Triggers the full ulw-loop workflow with native Antigravity collaboration tools.
metadata:
  short-description: "/ulw shorthand - runs ulw-loop"
---

# /ulw - Shorthand for ulw-loop

This is a thin alias for the full `ulw-loop` skill. When the user types `/ulw <task>`, execute durable, evidence-backed execution loops with native Antigravity collaboration tools.

## Instructions

1. If `ulw-loop` is available in the active skill list, read that skill and follow its instructions exactly.
2. If only this `ulw` alias is visible after a fresh install, run the same bounded loop directly from the inline Antigravity execution semantics below.
3. Do not require extra reference files. This alias must work when the installed package contains only the active `skills/ulw`, `skills/ulw-loop`, and `skills/ulw-plan` directories.

## Antigravity Execution Semantics

- **Work routing**: Decompose work into bounded planning, research, implementation, verification, and finalization phases as needed.
- **Model choice**: User-managed. Use the active Antigravity selection without naming, comparing, changing, or implying another selection.
- **Subagent Control Plane Envelope**: When invoking subagents via `invoke_subagent`, you must construct and pass a role envelope with `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, and `requiresParentAck=true`. Do not claim the whole `/ulw` task is complete, and do not mark run as completed or failed.
- **Resume guidance**: If execution is interrupted due to quota limits, preserve current evidence/state, tell the user what remains, and resume only after the user explicitly asks to continue.

## Verified quality-gate policy

After code edits, run on-demand LSP verification semantically through the local diagnostics tool: server id `lsp`, tool `diagnostics`, arguments `{filePath:"<absolute changed file>",severity:"error"}`. Map the three supported outcomes to the checked-in fixtures `test/fixtures/lsp/clean.json`, `test/fixtures/lsp/diagnostics.json`, and `test/fixtures/lsp/unavailable.json`.

- Clean output is exactly `LSP verification: clean (<file>)`.
- Diagnostic output starts with `LSP verification: <N> error(s) (<file>)` and includes only bounded, sanitized locations.
- Unavailable output is exactly `LSP verification unavailable: <reason>` and is never a clean result.

Do not describe unsupported automatic diagnostic payloads as verified gates; comment preservation and non-LSP file-targeted diagnostics remain experimental.

## After reading this file

Immediately proceed to execute the `ulw-loop` workflow if it is available; otherwise execute the inline bounded loop above. This alias adds no additional steps beyond the user-managed selection rule above.
