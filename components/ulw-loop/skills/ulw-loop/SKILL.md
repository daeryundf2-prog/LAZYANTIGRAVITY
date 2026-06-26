---
name: ulw-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

# ulw-loop

Use this skill when the user asks for `ulw-loop`, `ulw`, durable goal execution, evidence-led work, manual QA, or checkpointed long-running delivery.

This skill is intentionally compact. The full workflow lives in `references/full-workflow.md`. Read only the sections needed for the current phase, then execute them exactly.

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read through **Bootstrap** (including its tier triage), **Execution Loop**, and the **Manual-QA channels** table before running any ULW command or recording evidence.
3. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rules. Tests alone never prove done.

## Non-Negotiables

- Use the ulw-loop CLI state under `.omo/ulw-loop`; do not hand-edit goal state.
- After any compaction or context loss, re-read brief + goals + ledger FIRST (`omo sparkshell cat .omo/ulw-loop/ledger.jsonl` or read directly) plus `omo ulw-loop status --json`, then resume; never re-plan from scratch.
- If `omo ulw-loop create-goals` says the aggregate is already complete, start unrelated work with a fresh `--session-id <new-id>`. Use `--force` only to overwrite completed evidence intentionally.
- Every success criterion needs observable evidence from a real surface: channel proof, or auxiliary CLI stdout/DB diff/parsed config for CLI/data criteria.
- Record evidence through the CLI only after cleanup receipts are available.
- Delegate code edits, test writes, fixes, and QA execution to right-sized Antigravity subagents when the workflow requires it.
- Every `invoke_subagent` prompt starts with `TASK:`, then names `DELIVERABLE`, `SCOPE`, and `VERIFY`; include role, specialty, and required context.
- Plan and reviewer agents may run for a long time; invoke them in the background, keep doing independent root work, and rely on Antigravity's reactive resume when they send updates. Never simulate polling with repeated waits.
- For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long reading, testing, or review passes, and `BLOCKED: <reason>` only when it cannot progress.
- Track spawned agent names and conversation IDs locally. Treat subagent messages as mailbox signals, not proof of completion. A timeout only means no new mailbox update arrived. Treat a running child as alive.
- While children run, surface the active subagent count, agent names, and latest `WORKING:` phase.
- Fallback only when the child is completed without the deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running. Then record inconclusive and invoke a smaller self-contained task with the missing deliverable.
- Use `git-master` for git-tracked edits: inspect recent/touched-path history, then atomically commit each verified unit with only its files staged.

## Antigravity Tool Mapping

The full workflow may mention generic orchestration examples. In Antigravity, translate them to native tools:

| Workflow intent | Antigravity tool |
| --- | --- |
| Plan agent | `invoke_subagent(Subagents: [{TypeName: "self", Role: "Planning Agent", Prompt: "TASK: ..."}])` |
| Search/read-only worker | `invoke_subagent(Subagents: [{TypeName: "research", Role: "Codebase Explorer", Prompt: "TASK: ..."}])` |
| Implementation or QA worker | `invoke_subagent(Subagents: [{TypeName: "self", Role: "Implementation or QA Worker", Prompt: "TASK: ..."}])` |
| Final verification reviewer | `invoke_subagent(Subagents: [{TypeName: "self", Role: "Rigorous Reviewer", Prompt: "TASK: ..."}])` |
| Follow up with active worker | `send_message(Recipient: "<conversation-id>", Message: "TASK STILL ACTIVE: ...")` |
| Clean up active worker | `manage_subagents(Action: "kill", ConversationIds: ["<conversation-id>"])` |

When translating `load_skills=[...]`, include the requested skill names in the spawned agent's prompt.
