# Codex-native ULW tool mapping

Use this reference **only when the host runtime is OpenAI Codex** (or a Codex-compatible CLI).  
On **Google Antigravity**, ignore this file and follow `full-workflow.md` Antigravity sections (`invoke_subagent` + `node …/ulw-loop/dist/cli.js`).

## Tool mapping

| Workflow intent | Codex tool |
| --- | --- |
| Plan agent | `spawn_agent(agent_type="plan", fork_turns="none", ...)` |
| Search/read-only worker | `spawn_agent(agent_type="explorer", fork_turns="none", ...)` |
| Implementation or QA worker | `spawn_agent(agent_type="worker", fork_turns="none", ...)` |
| Final verification reviewer | `spawn_agent(agent_type="codex-ultrawork-reviewer", fork_turns="none", ...)` |
| Wait for background result | `wait_agent(...)` |
| Clean up finished worker | `close_agent(...)` |

## Delegation table (Codex models)

| Task shape | agent_type | model | reasoning_effort |
|---|---|---|---|
| Trivial / mechanical | `worker` | `gpt-5.4-mini` | `low` |
| Pure implementation | `worker` | `gpt-5.5` | `high` |
| Deep debugging | `worker` | `gpt-5.5` | `xhigh` |
| QA execution | `worker` | `gpt-5.5` | `high` |
| Read-only search | `explorer` | role default | role default |
| Docs research | `librarian` | role default | role default |
| Final review | `codex-ultrawork-reviewer` | role default | role default |

## Subagent reliability (Codex)

- Start every `spawn_agent` message with `TASK:`, then `DELIVERABLE`, `SCOPE`, `VERIFY`.
- Prefer `fork_turns: "none"` unless full history is required.
- Poll with short `wait_agent` cycles; do not use `list_agents` as a status feed.
- For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long passes and `BLOCKED: <reason>` only when progress stops.
- When translating `load_skills=[...]`, include skill names in the spawned agent `message`.

## Auto-routing

Codex may follow `model-catalog.json` `fallbackChain` on model-specific limits. Account-level quota exhaustion still requires a checkpoint and stop (no futile retries).
