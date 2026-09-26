# ulw-research — wave composition, lifecycle, and member briefs

## Roster rules

- **One member per axis — by part, ownership, or perspective, never a job title.** Each Phase 0 axis is one member owning one concrete slice: a codebase part, a source territory, or a question lens. No two members share an angle. "Backend researcher" or "the web person" gives no real boundary and invites overlap — name what the member owns.
- **Always the maximum roster.** The wave is not sized by taste: fill the parallel subagent slots the runtime allows on every run. If you can only name five axes, split the broadest one — by source territory, by time window, by perspective — until the roster is full. A half-empty wave is a half-covered topic.
- **Compose deliberately across the model tiers.** Antigravity routes by `Model`: `flash_lite` for cheap lookups, `flash` for standard recon and analysis, `pro` for contested analysis, attack lanes, and language work. Give each slot the cheapest tier that can do ITS job — broad recon on `flash`, contested analysis and skeptic lanes on `pro`. Mixed tiers by design, never one tier across the whole board. Every entry carries its full brief in `Prompt` — a role without a brief is dead weight.
- **Routing words from the user are literal.** "quick", "fast", "deep", "최대 병렬" are hard instructions, not mood. Route exactly as asked and journal `requested tier -> spawned model -> fallback reason` for every slot. Silently promoting a "quick" roster to a heavier tier is a defect, and so is dropping to a cheaper one without saying why.
- **Debate members are mandatory for ultradebate/hyperdebate, default otherwise.** At least one skeptic/red-team member (`Model: "pro"`) whose ONLY job is attack: cross-critique claims, evidence quality, source independence, synthesis structure, and report choices before they reach the deliverable. When the user says ultradebate or hyperdebate, run at least two attacking perspectives (e.g. a skeptic attacking evidence and a contrarian attacking framing) and give every contested claim a full round. Since subagents cannot receive mid-run follow-ups, run debate as a dedicated wave: collect claims in wave N, dispatch the attack wave in wave N+1 with the claims embedded in each prompt.
- **The raise law — every lead returns in the reply tail.** Member briefs order relentless reporting: every new lead, finding, contradiction, and dead end goes into the `## EXPAND` tail of the member's final reply, never hoarded. Act on each lead the moment its result lands (Phase 3) by folding it into the next wave's prompts.
- **Track shared state in the open.** Register the axes and major leads in `expansion-log.md` and `claim-graph.md` in `$SESSION_DIR` and keep them current so the run reconstructs after any context loss.

## Wave lifecycle — one wave sequence, or a staged lifecycle, decided by scale and precision

One research wave series is the floor, not the ceiling. Decide from the brief at Phase 0, and re-decide when the topic grows:

| Signal | Lifecycle |
|---|---|
| One deliverable, one domain, ordinary stakes | ONE wave series: research, debate, and synthesis in place. |
| 6+ axes, several source territories, or a long final document | Research waves first. Once the axes converge, launch a REFINEMENT wave of `Model: "pro"` members whose only job is to attack and sharpen the synthesis before a word of the document is written. |
| A wrong claim is expensive (legal, medical, financial, procurement, public-facing) or the user asked for ultradebate/hyperdebate on the CONCLUSIONS | The same split, plus a dedicated writing pass: the refinement wave hands a locked claim set to the assembly lane, and nothing enters the document that the refinement round did not survive. |

Sequencing beats stuffing — a fresh premium wave reading a finished journal reasons better than the same researchers grading their own homework. Build each wave from a written brief, run its round, and account for every result before the next wave starts.

## Member brief contract

Every member `Prompt` contains, in order:

1. `TASK:` — one imperative line naming the role and the owned axis.
2. The budget lift: "This is an explicit exhaustive-research assignment. Your default retrieval budget and stop-when-answered rules do not apply — run the full protocol below and raise every lead."
3. Scope — the axis, the sources to hit, and what a complete answer contains.
4. The role protocol (see `role-protocols.md`).
5. The raise law and the reply tail. EXPAND markers, observation candidates, and claim candidates travel back in the subagent's reply text, never as files. Every substantial report ends with:

```
## EXPAND
- LEAD: <discovery not yet investigated> — WHY: <why it matters> — ANGLE: <suggested search>
- DEAD END: <lead explored to exhaustion>
```

A member with nothing to expand returns `## EXPAND` followed by `none — <one-line reason>`. A report missing the tail is incomplete: that axis is not covered — respawn the lane in the next wave with the tail requirement spelled out again.
