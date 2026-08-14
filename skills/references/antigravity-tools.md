# Antigravity tool mapping (shared)

LazyAntigravity defaults to **Google Antigravity**. Use this mapping unless the host is explicitly Codex.

## Do

| Intent | Action |
| --- | --- |
| Explore / research / plan / implement / QA / review | `invoke_subagent` with TASK / DELIVERABLE / SCOPE / VERIFY |
| Role envelope | `mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, `requiresParentAck=true` |
| Optional model tier | `pro` \| `flash` \| `flash_lite` \| `inherit` (hint only; UI session model still dominates) |
| ULW state / evidence | `node <plugin>/components/ulw-loop/dist/cli.js ulw-loop …` after Bootstrap |

## Do not (on Antigravity)

- `spawn_agent`, `wait_agent`, `list_agents`, `close_agent`
- `get_goal`, `create_goal`, `update_goal`, `/goal clear` (Codex goal tools)
- OpenCode `task(...)`, `call_omo_agent(...)`, `team_*(...)`

## Codex

If the host is Codex, see `ulw-loop/references/codex.md`.
