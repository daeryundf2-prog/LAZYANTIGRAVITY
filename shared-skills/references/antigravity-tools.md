# Antigravity tool mapping (shared)

LazyAntigravity defaults to **Google Antigravity** + **Gemini 3.7 Flash (High)**.

## Do

| Intent | Action |
| --- | --- |
| Explore / research / plan / implement / QA / review | `invoke_subagent` with TASK / DELIVERABLE / SCOPE / VERIFY |
| Role envelope | `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, `requiresParentAck=true` |
| Model tier routing (`canTierRoute`) | `flash` (plan/code/research), `pro` (verify), `flash_lite` (tiny chores), `inherit` |
| ULW state / evidence | `node <plugin>/components/ulw-loop/dist/cli.js ulw-loop …` after Bootstrap |
| Read / edit files | host Read / Write / Edit (or equivalent); do not invent `view_file` / `apply_patch` |
| LSP | MCP `lsp.*` tools when the `lsp` server is configured |

## Canonical `invoke_subagent` shape

Copy this shape. Do **not** invent OpenCode kwargs (`subagent_type`, `run_in_background`, `load_skills`, `category`).

```
invoke_subagent(
  model_tier="flash",  // flash | pro | flash_lite | inherit
  prompt="""
TASK: <imperative assignment>
DELIVERABLE: <exact artifact or verdict>
SCOPE: <paths / constraints>
VERIFY: <commands or checks the parent will re-run>
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
"""
)
```

Embed role focus inside TASK text when useful (explorer / researcher / implementer / QA / reviewer). Keep the session UI on Gemini 3.7 Flash (High). For verify lanes use `model_tier="pro"` instead of switching the whole session.

## Do not

- Foreign spawn/wait/goal APIs and OpenCode `task(...)` / `call_omo_agent(...)` / `team_*(...)`
- Treating `subagent_type=` / `run_in_background=` / `load_skills=` as Antigravity API

## Wait / collect children

Stay in the parent. Continue independent work. Re-`invoke_subagent` for missing, ack-only, or `BLOCKED:` deliverables.
