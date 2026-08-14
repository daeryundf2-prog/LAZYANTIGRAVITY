<start-work-continuation>

You are mid-flight on a Prometheus work plan. The turn just ended without finishing the plan. This is an automatic continuation — keep going. Do NOT ask the user whether to continue; the contract is auto-continue until every top-level checkbox is `- [x]`.

# State

- Plan: `{{PLAN_NAME}}`
- Plan file: `{{PLAN_PATH}}`
- Boulder state: `{{BOULDER_PATH}}`
- Remaining top-level checkboxes: `{{REMAINING_COUNT}}` of `{{TOTAL_COUNT}}`
- Next incomplete task: `{{NEXT_TASK_LABEL}}`
{{WORKTREE_BLOCK}}
- Ledger: `{{LEDGER_PATH}}`
- Your session id in boulder.json: one of `antigravity:{{SESSION_ID}}`, `gemini:{{SESSION_ID}}`, or `codex:{{SESSION_ID}}`

# What to do this turn

1. Read `{{PLAN_PATH}}` AND `{{LEDGER_PATH}}` first — ground truth for what remains and what evidence has already been recorded. The plan checkbox and the ledger are the only sources of truth; do not trust your own memory of prior turns.
2. Pick the FIRST unchecked top-level checkbox in `## TODOs` or `## Final Verification Wave`. Ignore nested checkboxes under Acceptance Criteria / Evidence / Definition of Done.
3. Follow the `start-work` skill in full. Re-read `skills/start-work/SKILL.md` from the LazyAntigravity plugin if you have lost context.
4. Decompose the checkbox into atomic sub-tasks. On Antigravity, dispatch them in PARALLEL via `invoke_subagent` in this same response unless a sub-task has a NAMED blocking dependency. Every dispatch must include TASK / DELIVERABLE / SCOPE / VERIFY and the role envelope (`mayFinalizeRun=false`, `mayModifyGlobalRunState=false`, `mustReturn=SubagentResultEnvelope`, `requiresParentAck=true`).
5. Every sub-task message MUST be self-contained. It must include verification commands, one Manual-QA channel with exact tool + invocation, adversarial classes where applicable, a captured artifact path, and a cleanup receipt. Channels: HTTP (`curl -i`); tmux (`send-keys` + `capture-pane`); browser; computer-use. Tests are the floor; the channel artifact is the ceiling.
6. Treat every worker DoneClaim as untrusted. Independently verify before flipping any checkbox to FullyDone.
7. Do **not** call `wait_agent`, `list_agents`, `close_agent`, or `spawn_agent` on Antigravity. Stay in the parent, continue independent work, and re-invoke subagents as needed.
8. After verification of ALL sub-tasks under this checkbox: edit the plan to change `- [ ]` → `- [x]`, re-read the plan to confirm the count decreased, append a `task-completed` line to the ledger, then continue.
9. Do not start fresh on a sub-agent failure. Re-dispatch the same task with `FAILED: <exact error>` + `Diagnosis:` + `Fix:`.

# Hard constraints

- No production code before a failing test exists when behavior changes. PIN → RED → GREEN → SURFACE.
- No `--dry-run` as evidence. No "should work". No "tests pass" as completion proof.
- No `as any` / `@ts-ignore` / `@ts-expect-error`. No deleting failing tests.
- Cleanup receipt is mandatory. Leftover PIDs / tmux / browser / ports / temp dirs = BLOCKED, not PASS.
- The worktree path (if set in boulder.json) governs every file edit and command.
- session_ids you write to boulder.json MUST be prefixed: `antigravity:`, `gemini:`, or `codex:`.
- Prefer Gemini 3.7 Flash (High) as the session model unless verifying on 3.1 Pro.

# Stop conditions for THIS turn

- A top-level checkbox flipped to `- [x]` after verification. Then the Stop hook will re-evaluate; if more checkboxes remain you will be continued again.
- If blocked on a safety or missing-decision issue, stop and surface it to the user.
</start-work-continuation>
