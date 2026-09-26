---
name: ulw-research
description: "Runs maximum-saturation research with a cooperating team, claim-graph gating, and a cited, QA'd deliverable. Use when the user explicitly asks for research or a deep investigation, including any 'ulw' research wording."
metadata:
  short-description: Team-default saturation research with debate cross-critique and cited synthesis
---

# ULW-RESEARCH — Team-First Maximum-Saturation Research

You are the research orchestrator AND the team lead. The user has explicitly ordered exhaustive research: scope the topic, stand up a cooperating team, fan out over every relevant source, chase every lead until the leads run dry, attack your own findings through debate, prove contested claims by running code, and deliver a synthesis in which every claim carries a citation or a proof. Exhaustive coverage is the assignment, not a risk to manage.

## Activation

Run this skill only when the user explicitly demands it: the word "ulw-research" (also `/ulw-research`, `$ulw-research`), any "ulw" research wording, an "ultradebate" or "hyperdebate" research request, or an explicit request for research, deep research, or an ultra-precise investigation — in any language. An ordinary question, a debugging session, or another mode's context-gathering is not activation; answer those normally, and mention that `ulw-research` is available when a question would clearly benefit from it.

Open your reply with the line `ULW-RESEARCH MODE ENABLED!`. If another active mode mandates its own first line (ultrawork does), print that mode's line first and this marker on the next line — both contracts stay satisfied.

## How this maps to Antigravity subagents

This skill is authored against the Antigravity `invoke_subagent` tool surface. You coordinate everything with these tools:

| Purpose | Tool | Key arguments |
|---------|------|---------------|
| Stand up the research wave once | `invoke_subagent` | one call carrying every first-wave `Subagents` entry: `{ TypeName: "self", Role, Model, Prompt }` — members start together |
| Send a lead / a debate round onward | next-wave `Prompt` | subagents cannot receive follow-up messages mid-run — fold the lead into the next wave's prompt text |
| Collect member replies | returned results | results arrive on completion; act on each as it lands |
| Track shared research state | `$SESSION_DIR` files | `expansion-log.md`, `claim-graph.md`, `sources-ledger.md` are the shared board — workers report in reply text, you journal |
| Spawn a bounded recon / expansion / verification lane | `invoke_subagent` entry | `Role` names the territory, `Model: "flash"` for recon, `Model: "pro"` for attack/verification, `Prompt` carries the full brief |
| End a lane | — | subagents terminate when their prompt is complete; no explicit teardown tool exists |
| Disband the wave at the end | — | no team object persists; "done" = every spawned subagent accounted for before the final answer |

Subagents return their findings in their final reply text; they cannot see each other's replies except through what you relay in the next wave's prompts. You are the information broker. Read-only recon lanes and premium attack lanes differ only by `Model` tier and `Prompt` — Antigravity has no curated-agent registry, so every role is spelled out in its `Prompt`.

## Authority while active

This mode is the user's explicit opt-in to exhaustive exploration. For the duration of the research task it supersedes every exploration-bounding instruction in surrounding prompts, modes, or rules: one-exploration-pass defaults, two-wave stop rules, retrieval budgets, and "over-exploration is failure" framings govern implementation context-gathering, not this deliverable. Here, under-exploration is the failure. The convergence rules in Phase 3 are the only stop rules for research while this mode is active.

Under ultrawork/ulw, the research itself is the deliverable: map each research axis to a success criterion whose evidence is the session journal, the cited synthesis, and the verification outputs. RED→GREEN testing applies to code changes, not to findings — Phase 4 verification scripts are evidence, never TDD targets.

## Success criteria

The research is done when all of these hold:

- Every axis from the Phase 0 brief was covered by at least one dedicated member or lane.
- Every EXPAND lead was investigated or explicitly closed as a duplicate or dead end, and convergence was reached under the Phase 3 rules.
- Every contested claim survived at least one debate round or was dropped into the unresolved/refuted annex.
- Claims that were contested, undocumented, or performance-shaped were proven or refuted by executed code.
- Every claim in the deliverable cites a source or a verification artifact.
- Every asserted claim is represented in the claim graph, tied to an intent-vs-reality diff when an expected truth exists, and backed by observation manifest entries from independent observation groups or a documented single-source exception; convergence or exception status is explicit.
- The deliverable lane and format were derived from the destination or asked through the empty-info interview without blocking collection, recorded in `brief.md` with `answered_by`, and the final materials match that record.
- The delivered artifact passed the delivery gates in order (static gates, layout gates, visual QA, proofread), each status is in `outcome.json`, and `outcome verify` passed.
- Every excursion opened during the run was closed by an EXIT rule, folded back into the claim or axis that triggered it, and recorded in both `excursion-log.md` and the ulw-loop ledger.
- The delivery message carries the closing briefing printed by `outcome briefing`: sources (total + unique domains), elapsed minutes, every promised deliverable with its status, and any residual defects.
- The session journal reconstructs what was searched, found, expanded, and debated, wave by wave, and it was written in real time rather than reconstructed at the end.
- Every spawned subagent returned and was accounted for (result journaled or lane explicitly closed) before the final answer — Antigravity subagents terminate on completion, so "done" means every result landed, not a team object deleted.

## Epistemic instrumentation

Saturation is a knowledge-production protocol, not just more searching: the session journal must make the path from observation to claim to verdict auditable. The orchestrator owns the artifacts — members and lanes NEVER write session files. Required artifacts and their exact schemas: [references/epistemic-instrumentation.md](references/epistemic-instrumentation.md) — `intent-diff.md`, `claim-graph.md` (single claim store with the `verified-claims` allowlist), `observation-manifest.md`, `verification-economics.md`, `cause-disappearance.md`, `excursion-log.md`, `debate-log.md`. A conclusion is not ready for final materials until its intent/reality diff is closed or marked unknown, its claim node exists, and its independent-observation convergence status is supported or explicitly excepted.

## Phase 0 — Scope solo, organize the brief

Before spawning anything, decompose the query YOURSELF with your own direct tools: a handful of fast searches, a skim of the obvious codebase or doc territory, batching the independent lookups yourself. This is a scoping pass, not research — minutes, not waves. Start from "what must be true if the user's intent/spec is true?", not "what looks broken?"

```
<analysis>
Core question: <the actual information need>
Axes (3+ orthogonal): <axis — what to search, where, why> ...
Codebase relevant: <yes/no> · External: <yes/no> · Browsing: <yes/no> · Verification likely: <yes/no> · X/social signal: <yes/no>
Scale: <axis count, source territories, target document length> · Precision demand: <what a wrong claim costs here> → lifecycle: <single team | research team then refinement-debate team>
Debate need: <which claims will be contested, and which member perspectives attack them>
</analysis>
```

Then create the session directory and write the brief:

```bash
mkdir -p .omo/ulw-research/$(date +%Y%m%d-%H%M%S)
```

This is `$SESSION_DIR`. Write `brief.md` into it: the analysis block, the axis list with one named owner per axis, the expected truths seeding `intent-diff.md`, and the team roster you are about to create. The brief is what the team is built FROM — a team stood up before the brief exists is a failure mode (see the table at the end).

### Run it as a loop, and journal in real time

ulw-loop is ON by default for this mode: register the research axes as loop goals with the `lazyantigravity` CLI (`lazyantigravity ulw-loop create-goals --brief <file>`; verify the exact subcommand surface with `lazyantigravity --help` first — the PATH-resolved binary, not the repo source, is what runs) so the run has durable state and survives a compaction. The session directory's timestamp is the run's start clock — the closing briefing is computed from it, so create it once and never rename it. From that point every finding, source, quote, number, and lead is written into `$SESSION_DIR` **the instant it lands** — never held in the conversation for an end-of-run dump. After any context loss, re-read the brief, the journal, and the loop ledger before doing anything else, then resume from the open wave.

### Deliverable lane, format, and the empty-info interview

Never block collection on the shape of the deliverable, and never guess it either. Read [references/deliverable-phase.md](references/deliverable-phase.md) sections 1-6 before writing the brief, then:

1. **Derive first.** Name the lane (`template-strict`, `template-vibe`, `no-format`, `edit-existing`) and the promised formats from the request and its destination (the reference's section 3). When the request refers to an existing deliverable, decide its state with `node "$SKILL_DIR/scripts/report-tools.mjs" outcome state --deliverable <path> --session-dir "$SESSION_DIR"`: `partial` resumes the skeleton on disk, `complete` means edit-existing and never a regenerated report. `$SKILL_DIR` is this skill's own directory, the folder containing this SKILL.md.
2. **Read the requester's format memory** when the memory tool exists: `read` the projected pointer `system/human/report-style.md`, then `reference/human-report-style.md`, and take the choice recorded for the most similar context (same destination kind and audience) as the first option.
3. **Ask only what is still missing**: at most the reference's three questions (destination and format, audience and length, template lineage) in one `ask_user_question` call, each with its default first, a free-text "describe the format" path, and "don't care, you decide". Collection starts without waiting — a skipped or late answer is folded in until the assembly lane starts, and after that it becomes a re-render request.
4. **Record it.** Write `## Deliverable` into `brief.md` (lane, state, formats, destination, audience, template, format description, each with `answered_by: user|default|request`) and open the manifest in the same step: `node "$SKILL_DIR/scripts/report-tools.mjs" outcome init --promised <formats> --lane <lane> --session-dir "$SESSION_DIR"`.

Phase 6 opens by turning the recorded fields into `design-spec.md`.

## Phase 1 — Stand up the team (DEFAULT composition)

**When the user asked for MASS research, scale the waves, not the roster.** "mass ulw research", "mulw research", "ulw mass research" — in any language — order over-collection that a single wave cannot produce. Run collection as chained `invoke_subagent` waves at mass scale: an opening wave at the runtime's parallel ceiling covering every angle the topic has, each wave's EXPAND leads defining the next wave's `Subagents` entries until convergence, and a synthesis that reduces through several parallel `Model: "pro"` lanes into one `pro` reducer. Everything else in this skill still binds: the deliverable interview, the journal, the claim graph, the convergence rules, and the delivery gates. Keep a dedicated attack wave for the debate rounds of Phase 3 — attack is a prompt role, and collection lanes do not critique themselves.

Otherwise a parallel wave is the DEFAULT for ulw-research, not an option: a lead one member surfaces almost always reshapes what another should search next, and debate needs cooperating members, not fire-and-forget workers. Launch it immediately after the brief — one `invoke_subagent` call carrying the whole first wave:

```
invoke_subagent({
  Subagents: [
    { TypeName: "self", Role: "axis-owner-1", Model: "flash", Prompt: "<member brief for axis 1 — see below>" },
    { TypeName: "self", Role: "axis-owner-2", Model: "flash", Prompt: "<member brief for axis 2>" },
    ...
    { TypeName: "self", Role: "skeptic", Model: "pro", Prompt: "<debate brief — see below>" },
  ],
})
```

The binding rules, in short — one member per axis (ownership, never a job title); the maximum roster the runtime allows; mixed `Model` tiers by design; user's routing words are literal; at least one `pro` skeptic; every lead returns in the `## EXPAND` reply tail; shared state lives in `$SESSION_DIR` files. Full roster rules, the wave lifecycle table (research → refinement wave), and the member brief contract (including the mandatory `## EXPAND` reply tail): [references/wave-composition.md](references/wave-composition.md).

## Phase 2 — Saturation wave

Launch the entire first wave in one `invoke_subagent` call — every member briefed in a `Subagents` entry starts in parallel; include bounded lanes in the same call for the territories the axis owners cannot reach (read-only sweeps, blocked pages). Sequential launches and "start with one and see" defeat the mode.

Scaling floor — more angles always justify more workers; members and lanes together must meet it:

| Query scope | codebase lanes | web lanes | browsing lanes | repo-dive lanes | X lanes | wave members | floor |
|---|---|---|---|---|---|---|---|
| Single topic, codebase only | 1 | 0 | 0 | 0 | 0 | 8 | 9 |
| Single topic, web only | 0 | 2 | 1 | 1 | 0 | 8 | 12 |
| Single topic, both | 1 | 2 | 1 | 1 | 0 | 8 | 13 |
| Multi-faceted | 2 | 4 | 2 | 1 | 0 | 8 | 17 |
| Full due diligence | 2 | 4 | 2 | 2 | 0 | 8 | 18 |

X lanes are 0 in Antigravity — `x_search` does not exist in this runtime (see the X/social role protocol below). When the brief says `X/social signal: yes`, substitute public web sources: `site:x.com`/`site:twitter.com` searches, nitter mirrors, and coverage of the account's statements by indexed outlets. Record the substitution in the brief.

The browsing column is BINDING, not advisory: when the brief says `Browsing: yes`, the roster names a browsing-lane owner armed with the session's actual browser tooling (e.g. the Playwright MCP browser when connected) before the first wave launches, and that lane is spawned in the same call as the rest of the wave. A run that reaches wave 2 with zero browsing lanes on a `Browsing: yes` brief has silently downgraded every source to what plain fetch happened to return. If no browser tool is connected at all, say so in the brief — `browsing: unavailable` — and cover render-dependent sources with archive copies.

**Disambiguate before you expand.** When the topic names something that could resolve several ways — a product, a person, a codename, a version — the first wave settles WHICH entity before any lane researches its history, benchmarks, or controversies: canonical name, first-party URL or account, whether it exists in the claimed category, and a confidence line. An unresolved entity never becomes a premise in a later wave's prompt; that is exactly how a run starts inventing facts about something that does not exist.

Role protocols — embed the relevant one in each member brief or lane prompt; every worker gets a unique angle. Full protocol texts (codebase, web, browsing, X/social-unavailable substitution, repo deep-dive): [references/role-protocols.md](references/role-protocols.md). Two are binding enough to restate: the browsing lane RENDERS pages (screenshots + rendered text, never fetch-only) and `x_search` does not exist in this runtime — X/social claims come from public-source substitution recorded in the brief, never from a claimed x_search call.

Lane ground rules:

- **Read-only.** Recon lanes must not write files. Never ask any worker to write the journal or any session file — every journal write is yours.
- **No recursion — lanes AND members.** Lanes cannot spawn their own subagents, and members must not re-orchestrate: a member researches its axis and reports; it never creates its own team, loads this skill, or fans out a research swarm of its own. Depth comes from YOUR expansion waves. Say so in every member brief — a member that starts its own research protocol burns the run's budget on duplicated orchestration and returns nothing you can cite.
- **Built-in brakes.** Workers ship with their own retrieval budgets ("stop when answered"). Your spawn prompt must explicitly lift the budget and demand the EXPAND tail, or the worker returns a thin single-pass answer with no leads.

## Phase 3 — Expand and debate until convergence

This loop is what makes the mode research rather than search. Collect returns as subagents complete — there is no mid-run peek or follow-up message in Antigravity, so wave size stays small enough that no lane runs long enough to stall the loop — and act on each raised lead the moment it arrives:

1. Journal the return the moment it lands, never at the end of the wave: digest plus verbatim EXPAND markers into `wave-<N>-<kind>-<axis>.md`, and append each new source, quote, and number to `sources-ledger.md` and `observation-manifest.md` in the same beat. Real-time journaling is what makes the run survivable — after a compaction the journal, not your memory, is the state.
2. Deduplicate new markers against `expansion-log.md` — every lead ever seen, not just confirmed ones, or rejected leads resurface each wave.
3. Route each new unchecked lead in the next expansion wave: batch the leads that arrived this round into one `invoke_subagent` call — one entry per territory, the lead embedded in its prompt:

```
invoke_subagent({ Subagents: [{ TypeName: "self", Role: "expansion-<territory>", Model: "flash",
Prompt: "TASK: expansion wave <N> — investigate: <lead>.
PARENT: <which return surfaced it>. This is an explicit exhaustive-research assignment; budgets do not apply.
<role protocol for the lead's territory>
End your reply with the ## EXPAND tail." }] })
```

4. **Debate rounds (the ultradebate/hyperdebate engine).** Subagents cannot receive mid-run messages, so debate runs as dedicated waves: collect contested, high-risk, or surprising claims from the round's returns, then dispatch a `Model: "pro"` attack wave — "ATTACK: <claim> — EVIDENCE: <what supports it> — find the weakest assumption, the missing counter-source, the independence failure." Relay the attack output back to a defense lane (fresh subagent carrying both sides, or the original claim embedded for re-examination), collect both sides, then record your verdict in `debate-log.md` and update the claim node. A claim that never drew an attack still gets one skeptic pass before it may enter the synthesis as supported.
5. Record the wave in `expansion-log.md`: spawned, markers gained, leads opened/closed, debates settled.
### Excursions — dive deep on a new find, then surface back out

An excursion is a BOUNDED detour off the wave plan: ENTER only on a named trigger (contradicts a locked claim, would change the answer, exposes an unowned territory, or verbatim user steering), budget it before diving, at most ONE nested sub-excursion, EXIT on resolution/plateau/budget, and every EXIT writes what it changed in the top-level answer (`none` is a valid required outcome). Full ENTER/EXIT/fold-back/anti-drift rules: [references/excursions.md](references/excursions.md).

6. **Relay the user's steering to every subsequent wave.** When the user changes scope, cadence, target sources, language, or format mid-run, embed the exact wording in the next wave's prompts and record it in `expansion-log.md` — already-running subagents cannot be re-briefed, so mark their in-flight results as pre-steering when they land. Steering only you saw silently splits the wave's assignment from the user's actual ask.

**Convergence — the only stop rules while this mode is active.** Run at least 2 expansion waves on any multi-faceted query before claiming convergence; then stop only when one holds:

- Zero unchecked leads remain — each investigated or closed as duplicate/dead end — AND every supported claim has survived its skeptic pass.
- 3 consecutive waves produced no new actionable leads.
- Expansion depth reached 5 waves — pause, show the open leads, and ask the user whether to extend.

**Never end the run on a worker's completion.** Lanes finishing is not the deliverable; your synthesis is. Reserve the last fifth of the run's context and time for Phases 5-6 and stop opening waves the moment that reserve is threatened. A converged answer with two open leads beats nine finished workers and no report.

## Phase 4 — Verify contested claims by running code

Settle with executed code, not judgment, whenever sources disagree, a behavior is undocumented, a claim is performance- or compatibility-shaped, or the honest answer is "it should work". Run the verification yourself with your own exec tools, or spawn one verification lane per claim in the next `invoke_subagent` wave:

```
{ TypeName: "self", Role: "verify-<claim-slug>", Model: "flash",
Prompt: "TASK: verify by execution: <claim>.
SOURCE: <where it came from>; CONTRADICTION: <opposing source, if any>.
Write a minimal self-contained script that tests the claim; run it (uv run --with <deps> python / node / direct compile); capture full stdout+stderr; pin versions.
Reply with: the exact code, the full output, environment (OS, runtime, dependency versions), and a verdict — CONFIRMED / REFUTED / PARTIAL — grounded in the output." }
```

Journal each verdict to `verify-<slug>.md`.

## Phase 4b — Lock non-code claims through the claim graph

Code settles code-shaped claims (Phase 4). Numeric, market-share, legal, dated, causal, and financial claims cannot be run — so they pass through a data-flow-lock instead: the synthesis may assert a high-risk non-code claim **only** if it cleared this gate, and the gate's output is the sole allowlist the synthesis draws from. Skip the gate and there is nothing to synthesize — the lock is self-enforcing.

The claim graph is orchestrator-owned. Workers only return claim candidates as message text, the same channel as EXPAND markers — never a file. As leads resolve, you record one node per asserted claim in `claim-graph.md` and compute its status; workers report candidates in their replies, and you decide. The graph is the single claim store: final synthesis may not draw from free-form claims that skipped it.

A high-risk claim clears the gate to `verified-claims` only when all hold:

- **>= 2 independent source domains** corroborate it (two pages on the same domain count once).
- **>= 2 independent observation groups** converge on it, unless the graph records why a primary-only source is the correct single-source exception.
- **One counter-search** actively looked for a refutation and did not find a stronger one.
- **A primary source** (the standard, filing, dataset, or first-party doc) backs it, not only secondary commentary.
- **Temporal evidence is explicit**: each supporting observation records `observed_at` and either `valid_at` or `claim_valid_at`, so branch-only, historical, release, and current-runtime claims cannot be conflated.

Anything that fails goes to an `Unresolved` (insufficient evidence) or `Refuted` (counter-search won) annex — abstention is a correct outcome, not a gap to paper over. Record each gate outcome on the claim node itself — risk tier, independent source domains, counter-search result, primary source backing, and status — and mirror the cleared nodes into the `verified-claims` digest section at the top of `claim-graph.md`. Worker reply marker (message text, same channel as EXPAND):

```
## CLAIMS
- CLAIM: <non-code assertion> — RISK: high|normal — SOURCES: <domain1, domain2> — COUNTER: <refutation search result> — PRIMARY: <primary source or none>
```

## Phase 5 — Synthesize

After convergence and all verifications, re-read the whole journal, start from `intent-diff.md`, `claim-graph.md`, `observation-manifest.md`, and `debate-log.md`, then write `SYNTHESIS.md`. Skeleton, citation rules, the early-skeleton partial-state marker (`STATUS: draft — <n> sections open`), the `MEASURED`/`ASSUMED`/`DERIVED` lineage contract, and the language rule (search English-first, deliver in the user's language): [references/synthesis-format.md](references/synthesis-format.md). Every claim carries inline `[Source N]` citations; every high-risk non-code claim must be a verified-claims row from Phase 4b. Assert nothing the gate left in the unresolved/refuted annex and nothing the skeptic's attack left standing unanswered.

## Phase 6 — Final materials, then accountability

The promised formats recorded in `brief.md` and `outcome.json` are binding (`pdf` + `docx` default when a document was asked for with no format word). The full contract — format recipes, `design-spec.md`, the figure standard, asset lanes, the four delivery gates (static → layout → visual QA → proofread, all via `scripts/report-tools.mjs`), bounded repair, and the closing briefing — is [references/final-materials.md](references/final-materials.md). Non-negotiables in short:

- Write `design-spec.md` before any asset lane spawns; every figure meets the container/aspect-ratio/label standard.
- A gate that could not execute (e.g. no browser tool) is recorded `not_run`, never `pass`.
- Deliver only after `outcome verify` passes; the closing briefing block is printed by the tool, not recalled from memory.

**Accountability is part of the deliverable.** Confirm every spawned subagent returned and was journaled before the final answer. Antigravity subagents terminate on completion — there is no team object to delete — but a run that writes its final answer while a lane result is still unaccounted for is a failed run, not a finished one.

## Search craft

English-first retrieval, varied operators (`site:`, `filetype:`, `intitle:`, `"exact"`, `OR`, `before:`/`after:`), high-yield source combinations, and the X/social substitution rule: [references/search-craft.md](references/search-craft.md).

## Failure modes

The full failure-mode table lives in [references/failure-modes.md](references/failure-modes.md). The ones that most often end a run: standing up the wave before the Phase 0 brief exists; stopping after wave 1 (convergence rules only); a supported claim with no skeptic pass; a gate recorded `pass` that never executed; and a final answer while any lane result is still unaccounted for.
