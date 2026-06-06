---
name: ulw-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

## Antigravity Harness Tool Compatibility

This skill may include examples copied from the OpenCode or Codex harnesses. In Antigravity, do not call OpenCode/Codex-specific tools such as `call_omo_agent(...)`, `spawn_agent(...)`, `task(...)`, `background_output(...)`, `wait_agent(...)`, or `close_agent(...)` literally. Translate those examples to Antigravity native tools:

| OpenCode/Codex example | Antigravity tool to use |
| --- | --- |
| `call_omo_agent(subagent_type="explore", ...)` or `spawn_agent(agent_type="explorer", ...)` | `invoke_subagent(Subagents: [{TypeName: "research", Role: "Codebase Researcher", Prompt: "..."}])` |
| `call_omo_agent(subagent_type="librarian", ...)` or `spawn_agent(agent_type="librarian", ...)` | `invoke_subagent(Subagents: [{TypeName: "research", Role: "Codebase Researcher", Prompt: "..."}])` |
| `task(subagent_type="plan", ...)` or `spawn_agent(agent_type="plan", ...)` | `invoke_subagent(Subagents: [{TypeName: "self", Role: "Prometheus Planner", Prompt: "..."}])` |
| `task(subagent_type="oracle", ...)` or `spawn_agent(agent_type="codex-ultrawork-reviewer", ...)` | `invoke_subagent(Subagents: [{TypeName: "self", Role: "Oracle Reviewer", Prompt: "..."}])` |
| `task(category="...", ...)` or `spawn_agent(agent_type="worker", ...)` | `invoke_subagent(Subagents: [{TypeName: "self", Role: "Hephaestus Worker", Prompt: "..."}])` |
| `background_output(task_id="...")` or `wait_agent(...)` | Antigravity is reactive: you will automatically be resumed when a subagent sends a message. Simply stop calling tools/go idle while waiting. |
| `team_*(...)` | Use `invoke_subagent` to start concurrent subagents, then communicate with `send_message(Recipient, Message)`. |
| `close_agent(...)` or `kill` | `manage_subagents(Action="kill", ConversationIds=[...])` |

Antigravity subagents can be spawned with `invoke_subagent`. Use the `self` subagent type to inherit the parent config but run in a separate context, and `research` type to delegate read-only codebase or web search tasks. Communicate with active subagents using the `send_message` tool by their conversation ID. If a code block below conflicts with this section, this section wins.

For work likely to exceed one cycle, instruct the subagent to report progress regularly. When you launch a subagent or start a task in the background, you do not need to poll or check status in a loop. You will be automatically notified when there is an update. Simply go idle or proceed with other work.

# ulw-loop

Use this skill when the user asks for `ulw-loop`, `ulw`, durable goal execution, evidence-led work, manual QA, or checkpointed long-running delivery.

This Codex skill is intentionally compact to avoid adding a large operating manual to an already-full conversation. The full workflow lives in `references/full-workflow.md`. Read only the sections needed for the current phase, then execute them exactly.

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read through **Bootstrap**, **Execution Loop**, and the **Manual-QA channels** table before running any ULW command or recording evidence.
3. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rules. Tests alone never prove done.

## Non-Negotiables

- Use the ulw-loop CLI state under `.omo/ulw-loop`; do not hand-edit goal state.
- After any compaction or context loss, re-read brief + goals + ledger FIRST (`omo sparkshell cat .omo/ulw-loop/ledger.jsonl` or read directly) plus `omo ulw-loop status --json`, then resume; never re-plan from scratch.
- Every success criterion needs observable evidence from a real channel: tmux, HTTP, browser, or computer-use.
- Record evidence through the CLI only after cleanup receipts are available.
- Delegate code edits, test writes, fixes, and QA execution to right-sized Codex subagents when the workflow requires it.
- Every `spawn_agent` message starts with `TASK:`, then names `DELIVERABLE`, `SCOPE`, and `VERIFY`; role selection requires `agent_type`, while `model` + `reasoning_effort` alone creates a default agent, not a reviewer or worker; prefer `fork_turns: "none"` unless full history is truly required.
- Plan and reviewer agents may run for a long time; spawn them in the background, keep doing independent root work, and poll with short wait_agent cycles. Never use a single long blocking wait for them.
- For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long reading, testing, or review passes, and `BLOCKED: <reason>` only when it cannot progress.
- While any child is active, keep the parent visibly alive with brief status updates that include active subagent count, agent names, latest `WORKING:` phase, and whether the parent is waiting for mailbox updates.
- Track spawned agent names locally. Use `wait_agent` for mailbox signals, not proof of completion. A timeout only means no new mailbox update arrived; after a timeout, run a single `list_agents` check for the named child when you need reassurance. If it is running or its latest message is `WORKING:`, treat it as alive.
- Do not use `list_agents` as a polling loop or status feed; it can replay large payloads. Fallback only when the child is completed without the deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running. Then record inconclusive and respawn a smaller `fork_turns: "none"` task with the missing deliverable.
- Use `git-master` for git-tracked edits: inspect recent and touched-path commit history, then commit each verified work unit atomically in the repository's observed language, scope, and message style with only that unit's files staged.

## Codex Tool Mapping

The full workflow may mention OpenCode-style orchestration examples. In Codex, translate them to native tools:

| Workflow intent | Codex tool |
| --- | --- |
| Plan agent | `spawn_agent(agent_type="plan", fork_turns="none", ...)` |
| Search/read-only worker | `spawn_agent(agent_type="explorer", fork_turns="none", ...)` |
| Implementation or QA worker | `spawn_agent(agent_type="worker", fork_turns="none", ...)` |
| Final verification reviewer | `spawn_agent(agent_type="codex-ultrawork-reviewer", fork_turns="none", ...)` |
| Wait for background result | `wait_agent(...)` |
| Clean up finished worker | `close_agent(...)` |

When translating `load_skills=[...]`, include the requested skill names in the spawned agent's `message`.
