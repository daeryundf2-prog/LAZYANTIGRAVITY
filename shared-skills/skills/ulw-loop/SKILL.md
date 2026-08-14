---
name: ulw-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

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
- When invoking a subagent (using `invoke_subagent`), you must construct and pass a role envelope with the following parameters:
  - `mayFinalizeRun=false`
  - `mayModifyGlobalRunState=false`
  - `mustReturn=SubagentResultEnvelope`
  - `requiresParentAck=true`
  - Do not claim the whole /ulw task is complete.
  - Do not mark run as completed or failed.
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

## Token & Quota Safety and Safe-Resume Design

### 1. Limit / Error Classification
When a model or quota limit error occurs, classify it into one of the following:
- `context_window_exceeded`: Prompt or history size exceeds context window limit.
- `output_token_limit`: The response token count exceeds the maximum allowed output tokens.
- `model_rate_limited`: Rate limit (requests/min or tokens/min) has been hit.
- `account_quota_exceeded`: The platform account has exhausted its total credits or subscription quota.
- `provider_unavailable`: Network, HTTP 5xx, or provider endpoint is down.
- `unknown_model_error`: Any other API error.

### 2. Checkpoint Storage Structure
Before halting or shifting modes, save the execution state using:
`omo ulw-loop save-role-checkpoint --task-id <id> --platform <platform> --selected-model <model> --completed-roles <roles> --current-role <role> --next-recommended-action <action> --user-resume-command <cmd> --internal-resume-command <cmd> [--failed-role <role>] [--error-type <type>] [--files-changed <files>] [--commands-run <cmds>] [--artifacts-generated <arts>]`
Saved in: `.lazycodex/checkpoints/ulw-{timestamp}.json`

### 3. Antigravity Safety Flow (No Auto-Switching)
If rate limit/quota is detected in Antigravity:
- **Immediately Stop**: Abort the active execution loop immediately. Do not enter a retry loop.
- **Save Checkpoint**: Call `omo ulw-loop save-role-checkpoint` to save the failed/current role, completed roles, error type, files changed, etc.
- **Recommend Only (Fallback Sequence)**: Present a fallback model recommendation according to this exact sequence:
  - **When Claude Opus 4.6 (Thinking) is limited**:
    1. Gemini 3.1 Pro (High)
    2. Claude Sonnet 4.6 (Thinking) (if Sonnet quota is available)
    3. Gemini 3.7 Flash (High)
  - **When Claude Sonnet 4.6 (Thinking) is limited**:
    1. Gemini 3.1 Pro (High)
    2. Gemini 3.7 Flash (High)
  - **When Gemini 3.1 Pro (High) is limited**:
    1. Gemini 3.7 Flash (High)
    2. Gemini 3.7 Flash (Medium)
  - **When all models are limited/exhausted**:
    - Wait until the rate-limit/quota refresh window.
    - Or recommend that the user enable "AI Credit Overages" in settings.
- **Guide User**: Instruct the user to change the model manually in the Antigravity UI dropdown.
- **Resume Command**: Present the `/ulw resume` command to resume the process once the model is changed.

### 4. Codex Safety Flow (Auto-Routing)
If rate limit/quota is detected in Codex:
- **Model-Specific limit**: Attempt `fallbackChain` defined in model catalog.
- **Account-Level quota**: Stop immediately and save checkpoint via `omo ulw-loop save-role-checkpoint`. Do not make futile retries.
- **Retries & Backoff**: Limit automatic retries to maximum 1-2 attempts with light exponential backoff.

### 5. Compact Mode (On Context Window Exceeded)
If `context_window_exceeded` occurs, transition to Compact Mode:
- **Switch to Gemini 3.7 Flash (High)**: In Antigravity UI, switch to Gemini 3.7 Flash (High) to leverage its 1M token context window — 3.5x larger than GPT-5.5/Claude. This often eliminates the need for compaction entirely.
- **Summarize Logs**: Condense long test/execution logs into short summaries.
- **Relevant Slices**: Read/display only relevant lines of files instead of printing whole files.
- **Compress Outputs**: Limit role response size to 20-40 lines of summary in the transcript.
- **Save Artifacts**: Save complete details/code into local files and reference them by path in the chat.

### 6. Batch Mode (On Output Token Limit Expected)
If an upcoming task will exceed the output token limit:
- **Divide Changes**: Split edits into multiple smaller patch batches.
- **Incremental Verification**: Verify each patch batch individually.
- **Frequent Checkpointing**: Save the checkpoint after each successful batch.

### 7. Resume Behavior (`/ulw resume` or `omo ulw-loop resume`)
To resume work:
- **Actions performed directly**:
  - Load the latest checkpoint.
  - Display completed roles.
  - Display failed/halted roles.
  - Print the next recommended action.
  - Provide guidance so the succeeding agent can resume execution from where it paused.
- **Actions NOT automated (requires manual agent/user intervention)**:
  - Does not automatically spawn the worker subagent or restart the verifier/finalizer steps directly (the agent should trigger `invoke_subagent` as appropriate based on the output guidelines).
  - Does not attempt API-level automatic model switching in Antigravity (the user must manually switch the model in the UI dropdown before resuming).

### 8. AI Credit Overages
When all models are limited/exhausted:
- **Automatic Toggling Prohibited**: LazyCodex/Antigravity must NEVER automatically enable "AI Credit Overages" due to potential cost/billing implications.
- **User Notification**: Inform the user that "AI Credit Overages" can be enabled in their account settings to continue utilizing models beyond the quota, but require manual activation.
