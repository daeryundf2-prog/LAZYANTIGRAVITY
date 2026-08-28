# codex-start-work-continuation

Codex Stop-hook continuation injector for the omo-codex `start-work` skill.

It reads `.omo/boulder.json` in the hook payload `cwd`, resolves the active work, inspects the active plan for incomplete top-level checkboxes, and emits Codex Stop-hook JSON when the plan still has work:

```json
{"decision":"block","reason":"<directive>"}
```

The `reason` is loaded from `directive.md` on every invocation and filled with current plan state. The hook returns no output when `stop_hook_active` is `true`, when no active Boulder work exists, when the work is completed, when the active work is not tied to `codex:<session_id>`, or when all top-level plan checkboxes are complete.

This pairs with the `start-work` skill at `plugin/skills/start-work/SKILL.md`. That skill writes `.omo/boulder.json` with Codex session ids prefixed as `codex:` so the hook can continue only its own active Codex session.

## Counted plan checkboxes

Only column-0 checkboxes under these sections are counted:

- `## TODOs`
- `## Final Verification Wave`

Nested checkboxes under `### Acceptance Criteria`, `### Evidence`, and `### Definition of Done` are ignored.

## Smoke test

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/.omo/plans"
cat > "$TMP/.omo/plans/test.md" <<EOF
## TODOs
- [ ] Task one
- [ ] Task two
EOF
cat > "$TMP/.omo/boulder.json" <<EOF
{"schema_version":2,"active_work_id":"w1","works":{"w1":{"work_id":"w1","active_plan":".omo/plans/test.md","plan_name":"test","session_ids":["codex:smoke-session"],"status":"active"}}}
EOF
PAYLOAD='{"session_id":"smoke-session","turn_id":"t1","transcript_path":"","cwd":"'"$TMP"'","hook_event_name":"Stop","model":"gpt-5.5","permission_mode":"default","stop_hook_active":false}'
npm run build
echo "$PAYLOAD" | node dist/cli.js hook stop

PAYLOAD_LOOP='{"session_id":"smoke-session","turn_id":"t1","transcript_path":"","cwd":"'"$TMP"'","hook_event_name":"Stop","model":"gpt-5.5","permission_mode":"default","stop_hook_active":true}'
echo "$PAYLOAD_LOOP" | node dist/cli.js hook stop

rm -rf "$TMP"
```

Expect the first command to print JSON containing `"decision":"block"`; expect the anti-loop command to print nothing.

## License

MIT. See `LICENSE`.

## Privacy

This plugin only reads local hook payloads, `.omo/boulder.json`, the active plan, and the bundled directive. It makes no network calls and stores no telemetry.


## How it works (from the former session-persistence skill)

# session-persistence (Cross-Session State & Value Quantification Engine)

Inspired by the battle-tested `/money-save`, `/money-restore`, and `/money-report` workflows in `show-me-the-money`, this skill enables cross-session state persistence, decision checkpointing, hypothesis tracking, and quantitative value reporting across multi-session agentic workflows.

## 1. Core Capabilities

### A. Decision Checkpointing (`$session-save`)
- **State File**: Saves session state into `.omx/state/session-checkpoint.md` (or `.omo/state/session-checkpoint.md`).
- **Captured Fields**:
  1. **Core Intent & Goal**: Active architectural goals and deliverables.
  2. **Decided Architectural Choices**: Agreed tech stack, design patterns, and interface choices.
  3. **Ruled-Out Directions**: Explicitly rejected approaches and why they failed.
  4. **Active Hypotheses & Pending Tests**: Unverified assumptions needing empirical proof.
  5. **Next Immediate Action**: Single actionable task to resume with upon reconnection.

### B. State Restoration (`$session-restore`)
- **Action**: Reads `.omx/state/session-checkpoint.md` upon session start or user prompt.
- **Workflow**:
  1. Parses key decisions, ruled-out directions, and pending hypotheses.
  2. Synthesizes a 3-bullet continuity summary for the user.
  3. Immediately resumes execution from "Next Immediate Action" without re-asking solved questions.

### C. Value Quantification Reporting (`$value-report`)
- **Action**: Generates a quantitative summary of delivered value.
- **Metrics Tracked**:
  - **Code Quality**: Unit tests passed / total (e.g. 110/110 100% pass rate).
  - **Type Safety**: Typecheck errors eliminated (e.g. 0 type errors across 12 packages).
  - **Efficiency**: Token reduction percentage (e.g. 17% output token savings).
  - **Build Stability**: Zero build warnings / clean build receipts.

## 2. Execution Template

```markdown
# 💾 Session State Checkpoint

- **Date**: YYYY-MM-DD THH:mm:ss
- **Target Component**: [Component Name]

## 1. Core Decisions
- [x] Decision 1: [Approved Tech Stack/Pattern]
- [x] Decision 2: [Config / Model Tier Selection]

## 2. Ruled-Out Directions
- ❌ Direction 1: [Rejected approach & root-cause failure rationale]

## 3. Active Hypotheses
- 🧪 Hypothesis 1: [Assumption to verify empirically]

## 4. Next Immediate Action
- 🎯 Next Task: [Specific action to execute first upon restoration]
```
