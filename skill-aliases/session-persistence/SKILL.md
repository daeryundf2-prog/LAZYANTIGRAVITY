---
name: session-persistence
description: "Cross-session state persistence, decision checkpointing, hypothesis preservation, and value quantification report generator inspired by show-me-the-money. Triggers: session-save, session-restore, value-report, /session-save, /session-restore, /value-report, persistence."
metadata:
  short-description: "Cross-session state management, decision checkpointing, hypothesis tracking, and value quantification report generator"
---

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
