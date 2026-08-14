---
name: start-work
description: "Execute a Prometheus work plan on Antigravity with Boulder state, evidence ledger updates, worktree discipline, parallel invoke_subagent workers, and Stop-hook continuation. Use after planning when the user says start work, execute plan, continue plan, resume plan, or asks to run a .omo/plans plan."
---

## Antigravity Tool Mapping (default)

This plugin defaults to **Google Antigravity**. Read `../references/antigravity-tools.md` (or `../ulw-loop/references/codex.md` only on Codex).

| Intent | Antigravity action |
| --- | --- |
| Explore / research / plan / implement / QA / review | `invoke_subagent` + TASK/DELIVERABLE/SCOPE/VERIFY + role envelope |
| Wait / poll children | Stay in parent; re-invoke or continue the conversation — do **not** call `wait_agent` / `list_agents` |
| Optional model tier | `pro` \| `flash` \| `flash_lite` \| `inherit` (hint only) |

**Do not** use `spawn_agent`, `wait_agent`, `list_agents`, `close_agent`, `get_goal`, `create_goal`, or OpenCode `task(...)` / `call_omo_agent(...)` on Antigravity.

## Codex Tool Mapping

Codex-only hosts: see `../ulw-loop/references/codex.md`.

## Usage

```text
$start-work [plan-name] [--worktree <absolute-path>]
```

- `plan-name` is optional. It may be a full or partial file stem under `.omo/plans/`.
- `--worktree` is optional. Use it only when the user explicitly asks to work in a separate git worktree.

## Phase 1: Select the plan

1. Read `.omo/boulder.json` if it exists.
2. List Prometheus plan files under `.omo/plans/`.
3. If `plan-name` was provided, select the matching plan.
4. If exactly one active or paused Boulder work exists for this session, resume it.
5. If no active work exists and exactly one plan exists, select it.
6. If no active work exists and there is no selectable plan, enter **No-plan bootstrap**.
7. If multiple plans remain possible, ask one focused selection question.

### No-plan bootstrap

When the user explicitly said `start work` / `$start-work` and no selectable plan exists, treat that phrase as approval to create the plan before execution. Do not stall on a missing plan and do not ask for generic approval again.

If no selectable plan exists, bootstrap `ulw-plan` before execution.
Execution requires an approved plan before implementation; bootstrap mode creates that approved plan from the user's `start work` request instead of skipping planning.

1. Invoke the `ulw-plan` skill from the current request and require its dynamic adversarial workflow: collect, verify, design, adversarial plan-review, synthesize.
2. The generated Prometheus plan must be saved under `.omo/plans/<slug>.md` before implementation or Boulder state writes that point at plan work.
3. Use maximum safe parallelism in the generated plan: independent files/tasks fan out; same-file writes, shared state, and named dependencies serialize.
4. Preserve safety boundaries. Ask one focused question only when the objective is missing, destructive, or has a safety/product ambiguity that repository exploration cannot resolve.
5. After the plan exists, continue directly to Phase 2. The user's `start work` request is the bootstrap approval to create the plan and begin execution.

## Phase 2: Create or update Boulder state

Write `.omo/boulder.json` before implementation starts. Session ids must be prefixed for the host so the continuation hook can identify its own session (`antigravity:`, `gemini:`, or `codex:`).

```json
{
  "schema_version": 2,
  "active_work_id": "<work-id>",
  "works": {
    "<work-id>": {
      "work_id": "<work-id>",
      "active_plan": ".omo/plans/<plan-name>.md",
      "plan_name": "<plan-name>",
      "session_ids": ["antigravity:<session_id>"],
      "status": "active",
      "worktree_path": null
    }
  }
}
```

If `--worktree` is set, verify the path with `git worktree list --porcelain` or create it with `git worktree add <path> <branch-or-HEAD>`, then store the absolute path as `worktree_path`. All edits, commands, tests, and evidence capture must run inside that worktree.

## Phase 3: Execute the next checkbox

1. Read the full selected plan.
2. Find the first unchecked column-0 checkbox in `## TODOs` or `## Final Verification Wave`.
3. Ignore nested checkboxes under acceptance criteria, evidence, and definition-of-done sections.
4. Decompose that checkbox into atomic sub-tasks.
5. Dispatch independent sub-tasks in parallel with `invoke_subagent`; serialize only when one sub-task has a named dependency on another.

Each sub-task message must include:

1. Goal and exact files or directories in scope.
2. When the task touches existing behavior: a baseline characterization test, written first, that asserts current observable behavior and passes on the unchanged code. Then the red test or failing reproduction for the new behavior before production changes. Pin the baseline as rigorously as the new test: exact inputs, exact observable, exact assertion.
3. Implementation constraints from the plan and project rules.
4. Automated verification commands to run.
5. One Manual-QA channel, named with the exact tool and exact invocation (the literal `curl`, `send-keys`, `page.click`, payload, selectors, and the binary observable that decides PASS/FAIL), not "verify it works":
   - HTTP call: `curl -i` against the live endpoint.
   - tmux: a `tmux` session driven with `send-keys`, dumped via `capture-pane`.
   - Browser use: use Chrome to drive the real page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser).
   - Computer use: OS-level GUI automation against the running desktop app when the surface is not a page.
6. The adversarial classes that apply to this work item — from the 9 ultraqa classes — and how each is probed.
7. Required artifact path and cleanup receipt.

Apply ultraqa's 9 adversarial classes where relevant to each checkbox: malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions. A checkbox whose behavior is user-visible MUST probe every class that plausibly applies; record which classes were exercised and which were ruled not-applicable with a one-line reason.

## Phase 4: Verify and record evidence

For each checkbox, complete all five gates before marking it done:

1. Plan reread: confirm the checkbox and acceptance criteria.
2. Automated verification: run tests, typecheck, lint, build, or the plan-specific equivalent.
3. Manual-QA channel: capture a real artifact, not a dry-run claim.
4. Adversarial QA: exercise every applicable ultraqa class (malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions) and capture the observable result for each. "Tests pass" and a clean happy-path artifact are NOT sufficient when an adversarial class applies and was not probed.
5. Cleanup: register every QA resource teardown as its own todo the moment it is spawned (QA scripts, tmux assets, browser / agent-browser sessions, PIDs, ports, containers, temp dirs), then execute each and capture the receipt. No QA asset is left running.

Append evidence to `.omo/start-work/ledger.jsonl` using one JSON object per line. Include at least `event`, `plan`, `task`, `session_id`, `commands`, `artifact`, `adversarial_classes`, and `cleanup` fields. `adversarial_classes` lists each probed class with its observable result and each ruled-out class with a one-line reason.

### Sisyphus-style completion contract

A worker done claim is never final. Each implementation sub-task returns a `DoneClaim`, then a different context runs `AdversarialVerify`, then the verifier probes or reproduces the claim, then failures loop back to the executor, and only a confirmed verifier verdict becomes `FullyDone`.

```json
{
  "DoneClaim": {
    "task": "<task id/title>",
    "changed_files": ["path"],
    "tests": ["exact command + result"],
    "manual_qa": ["artifact path"],
    "cleanup": ["receipt"],
    "risks": ["known risk or none"]
  },
  "AdversarialVerify": {
    "verdict": "confirmed | false-positive | needs-fix | needs-human-review",
    "evidence": ["file path, command, log, artifact, or explicit not inspected"],
    "repro": "exact command or manual steps when available",
    "confidence": 0.0
  }
}
```

Rules:
- `confirmed` is the only pass verdict. `false-positive`, `needs-fix`, and `needs-human-review` all block checkbox completion.
- The verifier must be independent from the executor: use `codex-ultrawork-reviewer`, a scoped `worker` reviewer, or root only when root did not implement or materially rewrite that task.
- A worker done claim must be independently verified before it can become checkbox completion.
- On any non-confirmed verdict, append the feedback to the ledger, reset the checkbox work to in-progress, and re-dispatch the executor with the exact failure.
- The verifier must probe the applicable adversarial keys, including `stale_state`, `dirty_worktree`, and `misleading_success_output`, before allowing `FullyDone`.
- In prose evidence, name the same risks as stale state, dirty worktree, and misleading success output so reviewers can search for both key and human forms.
- Tests passing, green builds, or a worker DoneClaim without independent verification are not enough to mark a checkbox complete.

## Phase 5: Mark progress

Only after verification passes:

1. Edit the plan checkbox from `- [ ]` to `- [x]`.
2. Re-read the plan and confirm the remaining count decreased.
3. Append a `task-completed` ledger entry.
4. Continue with the next checkbox. Do not ask whether to continue.

## Completion

When all top-level checkboxes in `## TODOs` and `## Final Verification Wave` are complete:

1. Run the plan's final verification commands.
2. If worktree mode was used, sync `.omo/` state back to the main repo, merge or hand off exactly as requested, and remove the worktree only after successful merge or explicit handoff.
3. Remove or mark the Boulder work as completed.
4. Print an `ORCHESTRATION COMPLETE` block with the plan path, verification commands, artifacts, and cleanup receipts.

## Hard rules

- No production change before a failing test or reproduction exists, and no change to existing behavior before a baseline characterization test pins the current behavior and passes on the unchanged code.
- No `--dry-run` as completion evidence.
- No tests-only completion claim. A Manual-QA artifact is required.
- No completion claim while an applicable ultraqa adversarial class was never probed. Each applicable class needs a captured observable result; each skipped class needs a one-line not-applicable reason in the ledger.
- No unprefixed session ids in Boulder state when writing new work. Use `antigravity:<session_id>`, `gemini:<session_id>`, or `codex:<session_id>`.
- No stale-memory execution. The plan and ledger are the durable source of truth.
