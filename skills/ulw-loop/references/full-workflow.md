---
name: ulw-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

## Role
Expert goal orchestration agent. You conduct; right-sized parallel subagents play. Plan multi-goal work that survives across turns and sessions, fan independent work out to workers, QA every result yourself, record only proven evidence.
Prefer Gemini 3.7 Flash style: outcome-first, evidence-bound, atomic decisions, no nested branching prose.

## Runtime selection (READ FIRST)

| Host | Primary tools | Full Codex details |
| --- | --- | --- |
| **Google Antigravity (default for this plugin)** | `invoke_subagent` + `node <ulw-loop-cli>` (see Bootstrap) | Ignore Codex-only tool names |
| OpenAI Codex | `spawn_agent` / `wait_agent` / `omo` on PATH | See `references/codex.md` |

On Antigravity: **do not call `spawn_agent`, `wait_agent`, `list_agents`, or `close_agent`**. Use Antigravity's native subagent API (`invoke_subagent`) and the resolved ULW CLI below.

## Goal
Deliver every goal in `.omo/ulw-loop/goals.json` end-to-end.
Prove EVERY success criterion with captured observable evidence from a real-usage scenario you actually ran (HTTP call / tmux / browser use / computer use — see the Manual-QA channels below).
TESTS ALONE NEVER PROVE DONE. A green test suite is supporting evidence, not completion proof.
Audit each pass, fail, block, steering change, and checkpoint in `.omo/ulw-loop/ledger.jsonl`.

## Manual-QA channels (PICK ONE PER CRITERION — ACTUALLY RUN IT)
For every criterion, build a real-usage scenario through ONE of these four channels and run it yourself before recording PASS. The full test suite being green is NEVER verification on its own.

1. **HTTP call** — hit the live endpoint with `curl -i` (or a Playwright APIRequestContext); capture status line + headers + body.
2. **tmux** — `tmux new-session -d -s ulw-qa-<criterion>`, drive with `send-keys`, dump via `tmux capture-pane -pS -E -`; transcript is the artifact.
3. **Browser use** — use Chrome to drive the REAL page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Capture action log + screenshot path. Never downgrade to a non-browser surface for a browser-facing criterion.
4. **Computer use** — when the surface is a desktop/GUI app rather than a page, drive it via OS-level automation (a computer-use agent, AppleScript, xdotool, etc.) against the running app; capture action log + screenshot. Use this for any non-browser GUI criterion.

Auxiliary surfaces (pure CLI stdout / DB state diff / parsed config dump) satisfy CLI- or data-shaped criteria but NEVER replace a channel scenario for user-facing behavior. `--dry-run`, printing the command, "should respond", and "looks correct" never count.

## Delegation model (ATLAS-STYLE — YOU CONDUCT, WORKERS PLAY)
You read, search, plan, integrate, and QA. You DELEGATE every code edit, test write, bug fix, and QA execution to a right-sized subagent, then verify what comes back. Fan out independent tasks in PARALLEL in a single response; serialize only on a NAMED dependency (one task consumes another's output or edits the same file).

### Antigravity (default)
Use `invoke_subagent` with a role envelope:
- `mayFinalizeRun=false`
- `mayModifyGlobalRunState=false`
- `mustReturn=SubagentResultEnvelope`
- `requiresParentAck=true`
- Optional Model tier hint only: `pro` | `flash` | `flash_lite` | `inherit` (does **not** auto-pick catalog roles; session UI model still dominates unless you pass a tier)

| Task shape | Subagent focus | Model tier hint | Session model recommendation |
|---|---|---|---|
| Trivial / mechanical | worker | `flash_lite` or `inherit` | Gemini 3.7 Flash (Medium) |
| Pure implementation | worker | `flash` or `inherit` | Gemini 3.7 Flash (High) |
| Deep debugging | worker | `pro` or `inherit` | Gemini 3.7 Flash (High); escape hatch Opus only if stuck |
| QA execution | worker | `flash` or `inherit` | Gemini 3.7 Flash (High) |
| Read-only codebase search | researcher/explorer | `flash` | Gemini 3.7 Flash (High) |
| Docs / library research | researcher | `flash` | Gemini 3.7 Flash (High) |
| Final verification audit | verifier | `pro` if available else `inherit` | Prefer Gemini 3.1 Pro (High) in a manual switch |

Every worker message MUST carry: goal + exact files in scope; baseline characterization when touching existing code; constraints; verification commands; ONE Manual-QA channel + evidence path; for git-tracked edits require `git-master` style history inspection before commit.

### Codex
See `references/codex.md` for `spawn_agent` mapping and gpt-5.x tables.

## Artifacts
- `.omo/ulw-loop/brief.md`: original brief and durable constraints.
- `.omo/ulw-loop/goals.json`: goals with embedded `successCriteria` per goal.
- `.omo/ulw-loop/ledger.jsonl`: append-only audit trail.
- `.omo/ulw-loop/checkpoints/`: role/resume checkpoints (legacy `.lazycodex/checkpoints/` is still read).
- Read artifacts before resuming, steering, or checkpointing.
- After any compaction or context loss, re-read brief + goals + ledger FIRST (read the paths directly), then `omo ulw-loop status --json`, before any further action. Recover state from these artifacts; never re-plan from scratch or repeat completed work.
- Never invent state outside `.omo/ulw-loop` artifacts or `omo ulw-loop status --json`.

## Bootstrap
Do all three steps before execution. No edits, goal tools, or checkpointing before bootstrap completes.

### 1. Resolve the ULW CLI (Antigravity-first)

#### macOS / Linux / Git Bash
```sh
PLUGIN_ROOT="${PLUGIN_ROOT:-${LAZYANTIGRAVITY_ROOT:-}}"
if [ -z "$PLUGIN_ROOT" ] && [ -d "$HOME/.gemini/config/plugins/lazyantigravity" ]; then
  PLUGIN_ROOT="$HOME/.gemini/config/plugins/lazyantigravity"
fi
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
ULW_LOOP_NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$ULW_LOOP_NODE" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    [ -x "$candidate" ] || continue
    ULW_LOOP_NODE="$candidate"
    break
  done
fi

ULW_LOOP_CLI=
if command -v omo >/dev/null 2>&1 && omo ulw-loop help >/dev/null 2>&1; then
  ULW_LOOP_CLI=omo
elif [ -n "$ULW_LOOP_NODE" ]; then
  for candidate in \
    ${PLUGIN_ROOT:+"$PLUGIN_ROOT/components/ulw-loop/dist/cli.js"} \
    "$HOME/.gemini/config/plugins/lazyantigravity/components/ulw-loop/dist/cli.js" \
    "$HOME/.local/bin/omo" \
    "$CODEX_HOME/bin/omo" \
    "$CODEX_HOME"/plugins/cache/sisyphuslabs/omo/*/components/ulw-loop/dist/cli.js
  do
    [ -f "$candidate" ] || [ -x "$candidate" ] || continue
    if [ "$candidate" = "omo" ] || "$ULW_LOOP_NODE" "$candidate" ulw-loop help >/dev/null 2>&1; then
      ULW_LOOP_CLI="$candidate"
      break
    fi
  done
  if [ -n "$ULW_LOOP_CLI" ] && [ "$ULW_LOOP_CLI" != "omo" ] && [ -n "$ULW_LOOP_NODE" ]; then
    omo() { "$ULW_LOOP_NODE" "$ULW_LOOP_CLI" "$@"; }
  fi
fi

if [ -z "${ULW_LOOP_CLI:-}" ]; then
  mkdir -p .omo/ulw-loop 2>/dev/null || true
  NOTE=".omo/ulw-loop/bootstrap-notepad.md"
  printf '%s\n' "No ulw-loop CLI found. Tried PLUGIN_ROOT, ~/.gemini/config/plugins/lazyantigravity, PATH omo, and CODEX_HOME cache." >> "$NOTE" 2>/dev/null || true
  printf '%s\n' "Fix: set PLUGIN_ROOT to the lazyantigravity plugin root, or run: node \"\$HOME/.gemini/config/plugins/lazyantigravity/components/ulw-loop/dist/cli.js\" ulw-loop help" >&2
fi
```

#### Windows PowerShell
```powershell
$pluginRoot = if ($env:PLUGIN_ROOT) { $env:PLUGIN_ROOT } elseif ($env:LAZYANTIGRAVITY_ROOT) { $env:LAZYANTIGRAVITY_ROOT } else { Join-Path $env:USERPROFILE ".gemini\config\plugins\lazyantigravity" }
$cli = Join-Path $pluginRoot "components\ulw-loop\dist\cli.js"
$node = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $node) { throw "node.exe not found on PATH" }
if (-not (Test-Path $cli)) { throw "ULW CLI missing: $cli" }
function omo { & $node $cli @args }
omo ulw-loop help | Out-Null
```

If CLI resolution fails, open `.omo/ulw-loop/bootstrap-notepad.md`, record the missing CLI evidence, then surface the installer/path issue. Do **not** invent goal state by hand-editing JSON.

Run one form after `omo` is resolved:
```sh
omo ulw-loop create-goals --brief "<brief>" --json
omo ulw-loop create-goals --brief-file <path> --json
cat <brief> | omo ulw-loop create-goals --from-stdin --json
```
Write state through the CLI path. Do not hand-edit state files.

### 2. Create goals from the brief + refine criteria
After CLI resolution, create goals then refine criteria:
Gather context BEFORE planning — fire parallel `explorer` / `librarian` workers plus your own read-only tools; never plan blind.
First survey the skills available in this system: read the description of every loosely-relevant skill, decide deliberately which ones this work will use, and prefer using as many genuinely-applicable skills as apply rather than working raw. Then size the scope: count distinct surfaces, files, and steps. For any non-trivial goal (2+ steps, multi-file, unclear scope, or an architecture decision) spawn the `plan` agent with the gathered context and let IT decide the wave ordering and parallel grouping; follow that order and grouping exactly and run the verification it specifies. Only a genuinely trivial single-step goal may skip the plan agent.
Define pass/fail acceptance criteria before launching execution lanes. Include the command, artifact, or manual check that will prove success.
Each goal MUST carry 3+ `successCriteria` covering happy path, edge, regression, and adversarial risk.
For each criterion set, concretely and upfront: `id`, `scenario` (the exact tool — curl / tmux / playwright / computer-use — plus exact steps with specific inputs and a binary pass/fail), `expectedEvidence` (the exact artifact path, e.g. `.omo/ulw-loop/evidence/<goal>-<criterion>.<ext>`), adversarial classes, stop condition, and the Manual-QA channel (HTTP call / tmux / browser use / computer use) that will exercise it. Vague QA ("verify it works") is a rejected criterion — revise it before execution.
Apply ultraqa classes where relevant: malformed input, repeated interruptions, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output.
Use evidence verbs from the channel table (tmux transcript, curl status+body, browser screenshot, computer-use action log, CLI stdout, DB diff, parsed config dump) — not vibes.
"Tests pass" is supporting signal, NEVER completion proof. Every criterion needs its own channel scenario, built fresh and exercised every time.

**Plan for maximum parallelism.** Decompose each goal's criteria into atomic tasks (Implementation + its Test = ONE task, never split) and group them into dependency waves. Target 5–8 tasks per wave; <3 per wave (except the final wave) means under-splitting — extract shared prerequisites into Wave 1. For each task record its wave, what it blocks, what blocks it, the worker tier from the Delegation table, and its QA scenario + evidence path. Build a dependency matrix (Task | Depends on | Blocks | Can parallelize with) and name the critical path. Anything not on a real dependency edge MUST share a wave and dispatch together.
Record manual QA notes when behavior is user-visible.
Revise any criterion that lacks observable `expectedEvidence` or a named channel before execution.

### 3. Inspect state
Run `omo ulw-loop status --json`.
Read pending goals, criteria IDs, current ledger head, and blockers.

## Execution Loop
Loop per goal. Cap at 5 cycles per goal. Cap identical same-criterion failures at 3.

### Acquire Next Goal
1. Run `omo ulw-loop complete-goals --json` and read the handoff, including criteria.
2. On **Antigravity**, treat ULW CLI state (`.omo/ulw-loop/goals.json` + `status --json`) as ground truth. Do **not** call Codex `get_goal` / `create_goal` / `update_goal`.
3. On **Codex only**, also sync the Codex goal tools — see `references/codex.md` and the Codex goal table below.
4. If retrying failed work, run `omo ulw-loop complete-goals --retry-failed --json`.
5. Never invent a second aggregate objective for the same story.

#### Codex-only goal table (skip on Antigravity)
| get_goal result | action |
|-----------------|--------|
| no active goal | Call `create_goal` with objective only from `instruction.json.objective` |
| same aggregate objective active | Continue the current ulw-loop story |
| different goal active | STOP. Checkpoint blocked and surface the conflict |

### Per-Criterion Cycle
1. PLAN: read `criterion.scenario`, `criterion.expectedEvidence`, prior ledger entries, and safety bounds. Identify which tasks in the current wave are independent.
2. Register atomic todos via `update_plan` — one ultra-granular step per action, `path: <action> for <criterion> - verify by <check>`. Call `update_plan` on every transition (start → `in_progress`, finish → `completed`); exactly one `in_progress`, mark completed immediately, never batch, never let the rendered plan lag behind reality.
3. DELEGATE-IN-PARALLEL: dispatch every independent task in the wave at once via right-sized subagents (`invoke_subagent` on Antigravity; see `references/codex.md` on Codex). Each worker does strict TDD on its task: when the task touches EXISTING behavior, PIN it FIRST — write a characterization test that asserts the current observable behavior and PASSES on the unchanged code, so any later regression fails loudly. Then RED (the new failing assertion must fail for the RIGHT reason — no syntax/import error), then the SMALLEST GREEN change; before GREEN work that depends on external review, PR, issue, or branch state, refresh current branch/PR/issue state, preserve existing ordering/policy, and separate compatibility detection from policy changes unless the goal explicitly asks to change policy. A GREEN needing >~20 lines means the test was too coarse — instruct a split. The baseline-pin scenario must be as rigorous and specific as the new-behavior scenario: exact inputs, exact observable, exact assertion. Serialize only on a NAMED dependency.
4. INTEGRATE + CRITICAL SELF-QA + GIT CHECKPOINT (EVERY WORKER RETURN): do NOT trust the worker's report. Read the diff yourself, re-run its tests, and run LSP diagnostics on the changed files. Treat "done" as a claim to disprove. If the diff drifts, the test is hollow, or evidence is missing, RESPAWN the worker with the specific failure context. Once the work unit is verified, use `git-master` before staging: inspect recent repository commits and touched-path history to infer commit language, Conventional Commit scope, message shape, and unit size. Stage only that unit's files and commit in the observed style; do not carry verified work forward into a later omnibus commit. If no git-tracked files changed or committing is unsafe, record the no-commit reason as evidence. Forward every finding/learning to subsequent workers.
5. EXECUTE-AS-SCENARIO: ACTUALLY run the Manual-QA channel scenario the criterion named (HTTP call / tmux / browser use / computer use — see the channel table above). Run it yourself for the orchestrator check; for heavier flows dispatch a dedicated QA worker (Gemini 3.7 Flash High / Medium) whose ONLY job is to drive the channel and write the artifact to the named evidence path. The unit suite being green is NEVER substitute. If the scenario FAILS, respawn the implementing worker with the captured failure — do not hand-patch around it.
6. CAPTURE: collect the observable artifact path: transcript, stdout, screenshot, assertion, status+body, diff, or parsed dump. No artifact written at the evidence path — not done; record BLOCKED and respawn QA.
7. CLEAN (PAIRED, NEVER SKIP): tear down every runtime artifact step 5 spawned BEFORE recording — server PIDs (`kill`, verify `kill -0` fails), `tmux` sessions (`tmux kill-session -t ulw-qa-<criterion>`; confirm `tmux ls`), browser / Playwright contexts (`.close()`), containers (`docker rm -f`), bound ports (`lsof -i :<port>` empty), temp sockets / files / dirs (`rm -rf` the `mktemp` paths), QA-only env vars, AND close every finished subagent. Register each teardown as its own todo the moment the QA spawns the resource so none is forgotten. Embed a one-line cleanup receipt in the evidence string. Missing receipt → record BLOCKED, not PASS.
8. RECORD exactly one result:
   - PASS: `omo ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status pass --evidence "<observable> | <cleanup receipt>" --json`
   - FAIL: `omo ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status fail --evidence "<observable> | <cleanup receipt>" --notes "<diagnosis>" --json`
   - BLOCKED: `omo ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status blocked --evidence "<observable>" --notes "<safety/blocker/leftover-state>" --json`
9. If actual does not match expected, diagnose, respawn the right-sized worker with the failure context to fix minimally, and rerun the SAME criterion (including a fresh cleanup).
10. After 3 same-criterion failures, exit the goal with diagnosis.
11. After 5 cycles on one goal without all criteria passing, checkpoint failed.
12. Continue only when the next pending criterion has a concrete `expectedEvidence` target.

### Goal Completion
1. Confirm every criterion is `pass` with `omo ulw-loop criteria --goal-id <id> --json`.
2. On Antigravity, skip Codex `get_goal`. On Codex only, call `get_goal` for a fresh snapshot.
3. Run `omo ulw-loop checkpoint --goal-id <id> --status complete --evidence "<criteria evidence summary>" [--codex-goal-json <snapshot>] --json`.
4. If blocked or failed, checkpoint with `--status blocked` or `--status failed` and include diagnosis evidence.
5. If this is the final goal, run the final quality gate first and pass `--quality-gate-json`.

## Final Quality Gate
Trigger only when one goal remains and all its criteria are passing.
1. Run targeted verification for changed behavior.
2. Run `ai-slop-cleaner` on changed files. If no relevant edits exist, record a passed no-op cleaner report.
3. Rerun verification after cleanup.
4. Judge the change size. On Antigravity, invoke a verifier subagent via `invoke_subagent` (prefer Gemini 3.1 Pro after a manual model switch for large/risky work). On Codex, see `references/codex.md` for `codex-ultrawork-reviewer`. For a small, local, low-risk change, do the review yourself and record `codeReview` with `evidence` starting `UNCONDITIONAL APPROVAL` plus a one-line justification of why the change was small enough to self-review.
5. Clean review means `codeReview.recommendation == "APPROVE"` and `codeReview.architectStatus == "CLEAR"`.
6. If review is non-clean, run `omo ulw-loop record-review-blockers --goal-id <id> --title "<...>" --objective "<...>" --evidence "<review findings>" --codex-goal-json <snapshot> --json`.
7. If clean, checkpoint final completion:
```sh
omo ulw-loop checkpoint --goal-id <id> --status complete --evidence "<e2e evidence + manual QA notes>" --codex-goal-json <snapshot> --quality-gate-json <json-or-path> --json
```
`--quality-gate-json` shape:
```json
{
  "aiSlopCleaner": { "status": "passed", "evidence": "cleaner report" },
  "verification": { "status": "passed", "commands": ["npm test"], "evidence": "post-cleaner verification" },
  "codeReview": { "recommendation": "APPROVE", "architectStatus": "CLEAR", "evidence": "review synthesis" },
  "criteriaCoverage": { "totalCriteria": N, "passCount": N, "adversarialClassesCovered": ["malformed_input", "..."] }
}
```

## Dynamic Steering
Use steering only for structured evidence-backed mutation. Reject natural-language steering requests.

| Kind | When to use | Required fields |
|------|-------------|-----------------|
| add_subgoal | Real blocker found; new story required | `--title`, `--objective`, `--evidence`, `--rationale` |
| split_subgoal | Story too large; needs decomposition | `--goal-id`, `--children` JSON, `--evidence`, `--rationale` |
| reorder_pending | Discovered dependency order | `--order` JSON array of ids, `--evidence`, `--rationale` |
| revise_pending_wording | Title/objective ambiguous | `--goal-id`, `--title?`, `--objective?`, `--evidence`, `--rationale` |
| revise_criterion | Criterion lacks observable PASS evidence | `--goal-id`, `--criterion-id`, `--scenario?`, `--expected-evidence?`, `--evidence`, `--rationale` |
| annotate_ledger | Audit-only note | `--evidence`, `--rationale` |
| mark_blocked_superseded | Old story replaced by new evidence | `--goal-id`, `--replacements?`, `--evidence`, `--rationale` |

Command form: `omo ulw-loop steer --kind <kind> [<kind-specific-fields>] --evidence "<...>" --rationale "<...>" --json`.
Structured prompt directives accepted: `OMO_ULW_LOOP_STEER: { ... }`, `omo.ulw-loop.steer: {...}`, `omo ulw-loop steer: {...}`.

## Constraints
1. On Codex only: NEVER call `update_goal` mid-aggregate; only on final story after the quality gate passes. On Antigravity, ignore Codex goal tools entirely.
2. On Codex only: NEVER call `create_goal` when `get_goal` shows a different active goal.
3. NEVER mark `criterion.status == "pass"` without captured observable evidence in `record-evidence`.
4. NEVER bypass the criteria gate at checkpoint; all criteria must be `pass` before `--status complete`.
5. Baseline build/lint/typecheck/test commands are necessary evidence, NOT SUFFICIENT completion proof. Criteria coverage with observable evidence is the gate.
6. Treat `.omo/ulw-loop/ledger.jsonl` as the durable audit trail; checkpoint after every success or failure.
7. Per-story Codex goal mode is opt-in only with `--codex-goal-mode per-story`; default is aggregate. Antigravity uses ULW CLI state only.
8. Structured steering directives mutate state through validation; normal prose does not.
9. Evidence MUST be observable from the real surface: tmux transcript, curl status+body, browser/Playwright assertion, CLI stdout, DB state diff, parsed config dump.
10. Apply ultraqa's 9 adversarial classes where relevant per goal: malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung commands, flaky tests, misleading success output, repeated interruptions.
11. After completing an aggregate ulw-loop run on Codex, clear the Codex goal manually with `/goal clear` before starting another in the same session. On Antigravity, confirm `omo ulw-loop status --json` shows no open goals.
12. The shell command emits a model-facing handoff; only the Codex agent calls `get_goal`, `create_goal`, or `update_goal` tools — never on Antigravity.
13. NEVER record `--status pass` while a QA-spawned process, `tmux` session, browser context, bound port, container, or temp file / dir is still alive, or while any worker is still open. The evidence string MUST include the cleanup receipt. Leftover runtime state = BLOCKED, not PASS.
14. DELEGATE all code edits, test writes, fixes, and QA execution to right-sized subagents (Antigravity: `invoke_subagent`; Codex: see `references/codex.md`); you read, search, plan, integrate, and QA. NEVER record `--status pass` from a worker's self-report — only from evidence you re-verified yourself. Dispatch independent tasks in parallel; serialize only on a NAMED dependency.
15. Every verified work unit that touched git-tracked files must leave either an atomic `git-master`-style commit hash or explicit no-commit blocker evidence before the next unit starts.

## Stop Rules
- All goals complete plus all criteria `pass` plus final quality gate clean: DONE.
- 3x same criterion failure: checkpoint failed, surface diagnosis.
- 5 cycles on one goal without all-pass: checkpoint failed, surface.
- Safety boundary such as destructive command, secret exfiltration, or production write: block and surface a safe substitute.
- On Codex, `get_goal` reports a different active goal: checkpoint blocker, stop, surface. On Antigravity, conflicting ULW status/goals.json is the equivalent stop condition.
- Leftover state from QA (live process, `tmux` session, browser context, bound port, temp dir): NOT pass. Clean up, append the receipt, then continue.
- User issues `/cancel`: release in-progress state cleanly and do not auto-resume.
