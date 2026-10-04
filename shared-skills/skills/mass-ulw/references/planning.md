---
name: mass-ulw-planning
description: Planning checklist for mass-ulw. Read before defining the first wave.
---

# mass-ulw planning checklist

Concept credit: the wave/DAG orchestration idea follows the mass-ulw workflow in code-yeongyu/oh-my-openagent. This file is an independent rewrite for Antigravity; no upstream text is reproduced.

## Before launch

- [ ] Components listed (1 to 6), each node mapped to one component.
- [ ] Split-first applied: every node above `flash` has a one-line reason that survives "could this be several flash nodes?".
- [ ] Write scopes per wave are disjoint (list them side by side).
- [ ] Edges carry real result dependencies only.
- [ ] No cycles; every wave has at least one runnable node.
- [ ] Verification wave defined with literal commands.
- [ ] Ledger path chosen: `.omo/mass-ulw/<key>/ledger.md`.

## Do not split when

- Two pieces must edit the same file and cannot be untangled. Chain them or merge them.
- The piece is one judgment (design choice, root cause). Splitting yields confident partial answers.
- Briefing the node would take longer than doing the work.

## Split along

- Component: each shippable part is a lane.
- File domain: one component spanning disjoint file sets becomes one node per set.
- Phase: collect in parallel, then falsify the collections, then synthesize.

Implementation and its test stay in the same node.

## Shapes

- Fan-out then fan-in: N independent nodes, then one synthesis node depending on all.
- Two nodes with no edge between them are not a graph; launch them together without this skill.
- Large harvests: batch 50 to 200 items per node, one bounded report per node, aggregator per wave.

## Prompt lint

- [ ] TASK, DELIVERABLE, SCOPE, VERIFY, STOP WHEN all present, in order.
- [ ] No references to conversation history.
- [ ] PASS/FAIL observable stated as a concrete check.
- [ ] Instructions phrased as what to do; NEVER/ONLY reserved for real invariants.

## When things go wrong

| Symptom | Move |
|---|---|
| One node failed | Read its report, relaunch only that node with a fixed prompt |
| Node drifting mid-run | `send_message` naming the crossed boundary |
| Many nodes fail instantly | Model lane outage: switch `Model`, relaunch failed nodes |
| Node says done | Check the claimed fact before dependents launch |
| Context reset | Reload `.omo/mass-ulw/<key>/ledger.md`, resume at the first unfinished wave |
