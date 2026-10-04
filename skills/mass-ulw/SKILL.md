---
name: mass-ulw
description: "Runs dependency-ordered multi-agent work as waves of parallel invoke_subagent calls, with disjoint write scopes, five-field node prompts, and a mandatory verification wave. Use when the user says mass-ulw, mass ulw, task dag, or asks for fan-out work where some tasks must wait on others."
metadata:
  short-description: Wave-based DAG orchestration of subagents on Antigravity
---

# mass-ulw

Use this skill when the work splits into many pieces and some pieces depend on others. If every piece is independent, a single `invoke_subagent` call with several entries is enough; you do not need this skill.

Antigravity has no DAG engine. You are the scheduler: you hold the graph, launch one wave at a time with a single `invoke_subagent` call, and start the next wave only after the current one reports back. Read `references/planning.md` in this skill's directory before defining the first wave.

## 1. Lock the topology

Before writing any node:

1. List the 1 to 6 top-level components that can each succeed or fail on their own. Every node belongs to exactly one.
2. For each component, ask how to break it into small pieces that can run at the same time. Keep a piece whole only when splitting it would put two writers on one file, cut a single judgment call in half, or cost more in briefing than in doing.
3. Draw the dependency edges. An edge means "B needs A's finished result". Never add an edge just to pass along a fact you already know; paste the fact into B's prompt instead.
4. Self-check: no cycles, every edge points at a real node, every wave has a runnable node, no two nodes in the same wave write the same file.

Write the plan out before launching: waves, node ids, model per node with a one-line reason for anything above `flash`, and the verification wave.

## 2. Route each node

Start every node at the cheapest lane and climb only with a stated reason.

| Lane | `Model` | Use for |
|---|---|---|
| lookup | `flash_lite` | file listing, single grep, lint read |
| default | `flash` | mechanical or single-area code, search, drafting |
| hard | `pro` | cross-module reasoning, security, architecture, adversarial review |
| verdict | `inherit` | at most one node per graph, only on a Claude session, for the final call |

Agent types: `explore` for in-workspace search, `librarian` for upstream code and docs, `research` for read-only broad surveys, `self` for anything that writes. A wave where every node is `pro` is a routing mistake.

## 3. Write node prompts

A node sees only its prompt. Every prompt carries these fields, in this order:

1. TASK: one imperative sentence naming the deliverable.
2. DELIVERABLE: the exact artifact or report shape returned.
3. SCOPE: paths it may read, paths it may write, and what is out of bounds because another node owns it.
4. VERIFY: the literal command it runs on its own work and the expected result.
5. STOP WHEN: one observable condition.

Paste exact paths and facts. "As discussed" means nothing to a node. PASS or FAIL must be decidable from the prompt alone. One role per node: a node that investigates does not also fix.

## 4. Run waves

- Launch a wave as one `invoke_subagent` call with one entry per node. Use `Workspace: "branch"` for writer nodes whose scopes could collide; otherwise inherit.
- After launching, end your turn or do independent work. Completion wakes you; do not poll.
- On each report, check the node against its own SCOPE. Steer drift with `send_message` naming the boundary it crossed.
- Treat every node report as a claim. Before the next wave depends on it, check the specific fact (file exists, test passes, symbol exported).
- Append one entry per wave to `.omo/mass-ulw/<key>/ledger.md`: node id, model, status, evidence path. This file is how you resume after a context reset.

Wave width: one node per independent chunk, three or more per wave. Wider than about ten, add an aggregator node that reads bounded per-node reports so you never read N raw outputs yourself.

## 5. Verify

Any graph that changes code ends with a verification wave that depends on every producer. It runs the real test or build command and returns the captured output. Paginated deliverables (PDF, DOCX, slides) are checked by rendering every page, not by file size or grep. The run is done when the verification evidence passes, not when the last node says it finished.

## 6. Recover

- A failed node blocks only its dependents. Read its report first.
- Node alive but off track: `send_message` with the correction.
- Node finished wrong: relaunch that one node with a corrected prompt; keep finished siblings.
- Many nodes failing at start within seconds: the model lane is failing, not your prompts. Stop launching, switch `Model`, relaunch the failed ones.
- Cancel (`manage_subagents` kill) only to abandon the goal, never because a node is slow.

## Mass research

When the user pairs the mass trigger with research, over-collect: open with one node per angle (source territory, sub-question, entity, time window, competing approach), in waves of ten, until new leads stop appearing. Each node writes one bounded report (5k tokens or less) to the ledger directory. Reduce through several `pro` synthesis nodes that each own a slice, then one final reducer. Delivery gates from `ulw-research` still apply.
