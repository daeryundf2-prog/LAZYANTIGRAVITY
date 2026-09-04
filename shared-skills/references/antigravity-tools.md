# Antigravity tool mapping (shared)

LazyAntigravity defaults to **Google Antigravity** + **Gemini 3.8 Flash (High)**.

## Do

| Intent | Action |
| --- | --- |
| Explore / research / plan / implement / QA / review | `invoke_subagent` with TASK / DELIVERABLE / SCOPE / VERIFY |
| Role envelope | `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, `requiresParentAck=true` |
| Child model hint (`canTierRoute`, not host-enforced) | `Subagents[].Model`: `flash` (plan/code/research), `pro` (verify), `flash_lite` (tiny chores), `inherit` |
| ULW state / evidence | `node <plugin>/components/ulw-loop/dist/cli.js ulw-loop …` after Bootstrap |
| Read / edit files | host Read / Write / Edit (or equivalent); do not invent `view_file` / `apply_patch` |
| LSP | MCP `lsp.*` tools when the `lsp` server is configured |

## Canonical `invoke_subagent` shape

Live Antigravity schema (argument names only): top-level `Subagents`, `toolAction`, `toolSummary`; item `TypeName`, `Role`, `Model`, `Prompt`, `Workspace`. `Model` enum: `inherit` | `flash_lite` | `flash` | `pro`. There is **no** `model_tier` field.

Copy this shape. Do **not** invent OpenCode kwargs (`subagent_type`, `run_in_background`, `load_skills`, `category`) or a `model_tier` argument.

```
invoke_subagent(
  Subagents=[{
    TypeName: "self",
    Role: "<short-role>",
    Model: "flash",
    Prompt: """
TASK: <imperative assignment>
DELIVERABLE: <exact artifact or verdict>
SCOPE: <paths / constraints>
VERIFY: <commands or checks the parent will re-run>
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
"""
  }],
  toolAction: "Invoking <role> subagent",
  toolSummary: "<one-line summary>"
)
```

`Workspace` is optional. Embed role focus inside TASK text when useful (explorer / researcher / implementer / QA / reviewer). Keep the session UI on Gemini 3.8 Flash (High). For verify lanes pass `Model: "pro"` instead of switching the whole session. Passing `Model` is an agent hint (`hostEnforced=false`); do not claim the child model changed unless host `modelName` differs.

## Do not

- Foreign spawn/wait/goal APIs and OpenCode `task(...)` / `call_omo_agent(...)` / `team_*(...)`
- Treating `subagent_type=` / `run_in_background=` / `load_skills=` / `model_tier=` as Antigravity API

## Wait / collect children

Stay in the parent. Continue independent work. Re-`invoke_subagent` for missing, ack-only, or `BLOCKED:` deliverables.
