# Antigravity tool mapping (shared)

LazyAntigravity defaults to **Google Antigravity** + **Gemini 3.7 Flash (High)**. Use this mapping unless the host is explicitly Codex.

## Do

| Intent | Action |
| --- | --- |
| Explore / research / plan / implement / QA / review | `invoke_subagent` with TASK / DELIVERABLE / SCOPE / VERIFY |
| Role envelope | `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, `requiresParentAck=true` |
| Optional model tier | `pro` \| `flash` \| `flash_lite` \| `inherit` (hint only; UI session model still dominates) |
| ULW state / evidence | `node <plugin>/components/ulw-loop/dist/cli.js ulw-loop …` after Bootstrap |
| Read / edit files | host Read / Write / Edit (or equivalent); do not invent `view_file` / `apply_patch` |
| LSP | MCP `lsp.*` tools when the `lsp` server is configured |

## Canonical `invoke_subagent` shape

Copy this shape. Do **not** invent OpenCode kwargs (`subagent_type`, `run_in_background`, `load_skills`, `category`).

```
invoke_subagent(
  model_tier="flash",  // optional: pro | flash | flash_lite | inherit
  prompt="""
TASK: <imperative assignment>
DELIVERABLE: <exact artifact or verdict>
SCOPE: <paths / constraints>
VERIFY: <commands or checks the parent will re-run>
ROLE ENVELOPE: mayFinalizeRun=false; mayModifyGlobalRunState=false; mustReturn=SubagentResultEnvelope; requiresParentAck=true
"""
)
```

Embed role focus inside TASK text when useful (explorer / researcher / implementer / QA / reviewer). Prefer Gemini 3.7 Flash (High) as the session UI model; switch to Gemini 3.1 Pro only for cross-family verify.

## Do not (on Antigravity)

- `spawn_agent`, `wait_agent`, `list_agents`, `close_agent`
- `get_goal`, `create_goal`, `update_goal`, `/goal clear` (Codex goal tools)
- OpenCode `task(...)`, `call_omo_agent(...)`, `team_*(...)`
- Treating `subagent_type=` / `run_in_background=` / `load_skills=` as Antigravity API

## Wait / collect children

Stay in the parent. Continue independent work. Re-`invoke_subagent` for missing, ack-only, or `BLOCKED:` deliverables. Do not poll with Codex wait tools.

## Codex

If the host is Codex, see `ulw-loop/references/codex.md`.
